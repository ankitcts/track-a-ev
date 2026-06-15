// Tesla inventory client + criteria matching.
//
// Uses the unofficial JSON API that backs tesla.com/inventory. It is not a
// documented/supported endpoint, so we treat failures gracefully and never
// crash the poller on a bad response.

import {
  MODEL_URL_PATH,
  type Condition,
  type Financing,
  type MatchRecord,
  type ModelTarget,
  type TeslaModelCode,
  type TrackedSearch,
} from "./types";
import { estimateMonthlyLease, estimateMonthlyLoan } from "./lease";

const INVENTORY_ENDPOINT =
  "https://www.tesla.com/inventory/api/v4/inventory-results";

// One inventory query for a single model, derived from a tracked search.
interface InventoryQuery {
  model: TeslaModelCode;
  condition: Condition;
  zip?: string;
  financing?: Financing;
  // Per-model monthly cap → Tesla's server-side `paymentRange` filter.
  maxMonthly?: number;
  maxPrice?: number;
}

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
  // True when the listings are illustrative sample data served because Tesla's
  // live API couldn't be reached (it bot-blocks datacenter IPs with a 403).
  sample?: boolean;
}

// When the live API is unreachable, serve labeled sample inventory so the user
// gets a working experience instead of a dead end. Disable with
// TESLA_SAMPLE_FALLBACK=0.
const SAMPLE_FALLBACK = process.env.TESLA_SAMPLE_FALLBACK !== "0";

function sampleResult(model: TeslaModelCode, error?: string): FetchResult {
  if (!SAMPLE_FALLBACK) {
    return { status: "error", count: 0, listings: [], error };
  }
  const listings = mockInventory(model);
  return { status: "ok", count: listings.length, listings, sample: true };
}

// Map our financing values to Tesla's PaymentType.
function paymentType(financing?: Financing): string {
  if (financing === "loan") return "loan";
  if (financing === "cash") return "cash";
  return "lease";
}

// Build the inventory-results URL using the real query shape Tesla's site sends
// (PaymentType, paymentRange, Year options for used, etc.). Matching this shape
// is what gets a 200 instead of an error.
function buildQueryUrl(q: InventoryQuery): string {
  const condition = q.condition === "any" ? "new" : q.condition;
  const ptype = paymentType(q.financing);

  const inner: Record<string, unknown> = {
    model: q.model,
    condition,
    options:
      condition === "used"
        ? { Year: yearRange() }
        : {},
    arrangeby: condition === "used" ? "Odometer" : "Price",
    order: "asc",
    market: "US",
    language: "en",
    super_region: "north america",
    PaymentType: ptype,
    zip: q.zip || "94043",
    range: 200,
  };

  // Server-side payment filter (e.g. "0,300" for "≤ $300/mo").
  if (ptype !== "cash" && q.maxMonthly) inner.paymentRange = `0,${q.maxMonthly}`;

  const query = {
    query: inner,
    offset: 0,
    count: 50,
    outsideOffset: 0,
    outsideSearch: false,
    isFalconDeliverySelectionEnabled: false,
    version: null,
  };
  return `${INVENTORY_ENDPOINT}?query=${encodeURIComponent(JSON.stringify(query))}`;
}

function yearRange(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2018; y <= now + 1; y++) years.push(y);
  return years;
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

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not.A/Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
};

// Primary source: the JSON API behind tesla.com/inventory.
async function tryApiInventory(q: InventoryQuery): Promise<FetchResult> {
  try {
    const res = await fetch(buildQueryUrl(q), {
      headers: {
        ...BROWSER_HEADERS,
        Accept: "application/json, text/plain, */*",
        Referer: `https://www.tesla.com/inventory/${q.condition === "any" ? "new" : q.condition}/${q.model}`,
        Origin: "https://www.tesla.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) return { status: "error", count: 0, listings: [], error: `Tesla API responded ${res.status}` };
    const data = (await res.json()) as { results?: RawListing[] | { exact?: RawListing[] } };
    let listings: RawListing[] = [];
    if (Array.isArray(data.results)) listings = data.results;
    else if (data.results && Array.isArray((data.results as { exact?: RawListing[] }).exact))
      listings = (data.results as { exact: RawListing[] }).exact;
    return { status: listings.length ? "ok" : "no-results", count: listings.length, listings };
  } catch (err) {
    return { status: "error", count: 0, listings: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// Secondary source: scrape the public inventory webpage and pull listings out
// of the JSON the page embeds (e.g. __NEXT_DATA__ / application/json islands).
async function tryHtmlInventory(q: InventoryQuery): Promise<FetchResult> {
  try {
    const cond = q.condition === "any" ? "new" : q.condition;
    const url = `https://www.tesla.com/inventory/${cond}/${q.model}?zip=${q.zip || "94043"}`;
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) return { status: "error", count: 0, listings: [], error: `Tesla page responded ${res.status}` };
    const html = await res.text();
    const listings = extractListingsFromHtml(html);
    return { status: listings.length ? "ok" : "no-results", count: listings.length, listings };
  } catch (err) {
    return { status: "error", count: 0, listings: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// Pull every object that looks like an inventory listing (has a 17-char VIN) out
// of the JSON blobs embedded in the page's <script> tags.
function extractListingsFromHtml(html: string): RawListing[] {
  const found: RawListing[] = [];
  const seen = new Set<string>();
  const collect = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(collect);
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.VIN === "string" && /^[A-HJ-NPR-Z0-9]{17}$/.test(obj.VIN) && !seen.has(obj.VIN)) {
        seen.add(obj.VIN);
        found.push(obj as RawListing);
      }
      Object.values(obj).forEach(collect);
    }
  };
  const scriptRe = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html))) {
    try {
      collect(JSON.parse(m[1]));
    } catch {
      /* not parseable JSON — skip */
    }
  }
  return found;
}

export async function fetchInventory(q: InventoryQuery): Promise<FetchResult> {
  if (process.env.TESLA_MOCK === "1") {
    const listings = mockInventory(q.model);
    return { status: listings.length ? "ok" : "no-results", count: listings.length, listings };
  }

  // 1) JSON API → 2) scrape the inventory webpage → 3) labeled sample fallback.
  const api = await tryApiInventory(q);
  if (api.status === "ok") return api;

  const page = await tryHtmlInventory(q);
  if (page.status === "ok") return page;

  if (api.status === "no-results" || page.status === "no-results") {
    return { status: "no-results", count: 0, listings: [] };
  }
  // Both blocked/unreachable (typically 403 on cloud IPs) — serve sample data.
  return sampleResult(q.model, api.error || page.error);
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
  search: TrackedSearch,
  sample = false
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
    // For sample data, link to the real inventory page (the VIN isn't real).
    orderUrl: sample
      ? `https://www.tesla.com/inventory/new/${target.model}`
      : orderUrl(target.model, vin),
    reason,
    sample,
    foundAt: new Date().toISOString(),
  };
}

export interface EvaluateResult {
  status: "ok" | "error" | "no-results";
  inventoryCount: number;
  matches: MatchRecord[];
  closest?: MatchRecord;
  error?: string;
  // True when results came from labeled sample data (Tesla unreachable).
  sample?: boolean;
}

// Fetch inventory for every model target in a search and evaluate matches.
export async function evaluateSearch(
  search: TrackedSearch
): Promise<EvaluateResult> {
  let inventoryCount = 0;
  let allRecords: MatchRecord[] = [];
  const errors: string[] = [];
  let sample = false;

  for (const target of search.models) {
    const result = await fetchInventory({
      model: target.model,
      condition: search.condition,
      zip: search.zip,
      financing: search.financing,
      maxMonthly: target.maxMonthly,
      maxPrice: target.maxPrice,
    });
    if (result.status === "error" && result.error) errors.push(result.error);
    if (result.sample) sample = true;
    inventoryCount += result.count;
    for (const listing of result.listings) {
      if (!listingPrice(listing)) continue;
      allRecords.push(scoreListing(listing, target, search, result.sample));
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
    sample,
  };
}
