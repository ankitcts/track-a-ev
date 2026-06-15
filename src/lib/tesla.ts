// Tesla inventory client + criteria matching.
//
// Uses the unofficial JSON API that backs tesla.com/inventory. It is not a
// documented/supported endpoint, so we treat failures gracefully and never
// crash the poller on a bad response.

import {
  MODEL_URL_PATH,
  type Condition,
  type MatchRecord,
  type ModelTarget,
  type TeslaModelCode,
  type TrackedSearch,
} from "./types";
import { estimateMonthlyLease, estimateMonthlyLoan } from "./lease";

const INVENTORY_ENDPOINT =
  "https://www.tesla.com/inventory/api/v4/inventory-results";

interface RawListing {
  VIN?: string;
  TrimName?: string;
  Price?: number;
  InventoryPrice?: number;
  PurchasePrice?: number;
  TotalPrice?: number;
  Model?: string;
  [key: string]: unknown;
}

export interface FetchResult {
  status: "ok" | "error" | "no-results";
  count: number;
  listings: RawListing[];
  error?: string;
}

function buildQueryUrl(
  model: TeslaModelCode,
  condition: Condition,
  zip?: string
): string {
  const query = {
    query: {
      model,
      condition: condition === "any" ? "new" : condition,
      options: {},
      arrangeby: "Price",
      order: "asc",
      market: "US",
      language: "en",
      super_region: "north america",
      zip: zip || "94043",
      range: 200,
    },
    offset: 0,
    count: 50,
    outsideOffset: 0,
    outsideSearch: false,
  };
  return `${INVENTORY_ENDPOINT}?query=${encodeURIComponent(
    JSON.stringify(query)
  )}`;
}

// Deterministic sample inventory for demos / offline dev / when Tesla's
// undocumented API bot-blocks (HTTP 403). Enable with TESLA_MOCK=1.
function mockInventory(model: TeslaModelCode): RawListing[] {
  const base: Record<TeslaModelCode, RawListing[]> = {
    m3: [
      { VIN: "MOCK3RWD0001", TrimName: "Rear-Wheel Drive", InventoryPrice: 38990 },
      { VIN: "MOCK3LR00002", TrimName: "Long Range AWD", InventoryPrice: 45990 },
    ],
    my: [
      { VIN: "MOCKYRWD0001", TrimName: "Rear-Wheel Drive", InventoryPrice: 44990 },
      { VIN: "MOCKYLR00002", TrimName: "Long Range AWD", InventoryPrice: 50490 },
    ],
    ms: [{ VIN: "MOCKS000001", TrimName: "All-Wheel Drive", InventoryPrice: 74990 }],
    mx: [{ VIN: "MOCKX000001", TrimName: "All-Wheel Drive", InventoryPrice: 79990 }],
  };
  return base[model];
}

export async function fetchInventory(
  model: TeslaModelCode,
  condition: Condition,
  zip?: string
): Promise<FetchResult> {
  if (process.env.TESLA_MOCK === "1") {
    const listings = mockInventory(model);
    return { status: listings.length ? "ok" : "no-results", count: listings.length, listings };
  }
  try {
    const res = await fetch(buildQueryUrl(model, condition, zip), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // Don't let a slow/blocked request hang the poller.
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        status: "error",
        count: 0,
        listings: [],
        error: `Tesla API responded ${res.status}`,
      };
    }
    const data = (await res.json()) as { results?: RawListing[] | { exact?: RawListing[] } };
    // The API has returned results under a few shapes over time.
    let listings: RawListing[] = [];
    if (Array.isArray(data.results)) listings = data.results;
    else if (data.results && Array.isArray((data.results as { exact?: RawListing[] }).exact))
      listings = (data.results as { exact: RawListing[] }).exact;

    return {
      status: listings.length ? "ok" : "no-results",
      count: listings.length,
      listings,
    };
  } catch (err) {
    return {
      status: "error",
      count: 0,
      listings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function listingPrice(l: RawListing): number {
  return (
    l.InventoryPrice ??
    l.PurchasePrice ??
    l.Price ??
    l.TotalPrice ??
    0
  );
}

function orderUrl(model: TeslaModelCode, vin: string): string {
  return `https://www.tesla.com/${MODEL_URL_PATH[model]}/order/${vin}`;
}

// Score a single listing against a model target. Returns 1 for a full match,
// and a partial 0..1 score for near-misses (used to pick the "closest" listing).
function scoreListing(
  listing: RawListing,
  target: ModelTarget,
  search: TrackedSearch
): MatchRecord {
  const price = listingPrice(listing);
  const vin = listing.VIN || "UNKNOWN";
  const trimName = listing.TrimName || "";

  let estimatedMonthly: number | null = null;
  if (search.financing === "lease") {
    estimatedMonthly = estimateMonthlyLease(price, {
      downPayment: search.maxDownPayment ?? 0,
    });
  } else if (search.financing === "loan") {
    estimatedMonthly = estimateMonthlyLoan(price, {
      downPayment: search.maxDownPayment ?? 0,
    });
  }

  const checks: { ok: boolean; weight: number; label: string }[] = [];

  if (target.trim) {
    const ok = trimName.toLowerCase().includes(target.trim.toLowerCase());
    checks.push({ ok, weight: 1, label: `trim ${target.trim}` });
  }
  if (target.maxPrice != null) {
    const ok = price > 0 && price <= target.maxPrice;
    checks.push({
      ok,
      weight: 2,
      label: `price ≤ $${target.maxPrice.toLocaleString()}`,
    });
  }
  if (target.maxMonthly != null && estimatedMonthly != null) {
    const ok = estimatedMonthly <= target.maxMonthly;
    checks.push({
      ok,
      weight: 2,
      label: `${search.financing} ≤ $${target.maxMonthly}/mo`,
    });
  }

  // No constraints means any listing of this model qualifies.
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const passedWeight = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const score = checks.length === 0 ? 1 : passedWeight / totalWeight;
  const isMatch = checks.every((c) => c.ok);

  const failed = checks.filter((c) => !c.ok).map((c) => c.label);
  const reason = isMatch
    ? "Meets all criteria"
    : `Missed: ${failed.join(", ")}`;

  return {
    vin,
    model: target.model,
    trimName,
    price,
    estimatedMonthly,
    score,
    isMatch,
    orderUrl: orderUrl(target.model, vin),
    reason,
    foundAt: new Date().toISOString(),
  };
}

export interface EvaluateResult {
  status: "ok" | "error" | "no-results";
  inventoryCount: number;
  matches: MatchRecord[];
  closest?: MatchRecord;
  error?: string;
}

// Fetch inventory for every model target in a search and evaluate matches.
export async function evaluateSearch(
  search: TrackedSearch
): Promise<EvaluateResult> {
  let inventoryCount = 0;
  let allRecords: MatchRecord[] = [];
  const errors: string[] = [];

  for (const target of search.models) {
    const result = await fetchInventory(
      target.model,
      search.condition,
      search.zip
    );
    if (result.status === "error" && result.error) errors.push(result.error);
    inventoryCount += result.count;
    for (const listing of result.listings) {
      if (!listingPrice(listing)) continue;
      allRecords.push(scoreListing(listing, target, search));
    }
  }

  const matches = allRecords.filter((r) => r.isMatch);
  // Closest = highest score, then cheapest, among everything we saw.
  const closest = [...allRecords].sort(
    (a, b) => b.score - a.score || a.price - b.price
  )[0];

  let status: EvaluateResult["status"] = "ok";
  if (allRecords.length === 0) {
    status = errors.length ? "error" : "no-results";
  }

  return {
    status,
    inventoryCount,
    matches,
    closest,
    error: errors[0],
  };
}
