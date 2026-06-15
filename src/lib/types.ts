// Shared domain types for the Tesla tracker.

export type TeslaModelCode = "m3" | "my" | "ms" | "mx";

export const MODEL_LABELS: Record<TeslaModelCode, string> = {
  m3: "Model 3",
  my: "Model Y",
  ms: "Model S",
  mx: "Model X",
};

// URL path segment used on tesla.com (e.g. /modely/order/<vin>).
export const MODEL_URL_PATH: Record<TeslaModelCode, string> = {
  m3: "model3",
  my: "modely",
  ms: "models",
  mx: "modelx",
};

export type Financing = "lease" | "loan" | "cash";
export type Condition = "new" | "used" | "any";

// One model the user is interested in, with optional per-model caps.
export interface ModelTarget {
  model: TeslaModelCode;
  // Max acceptable monthly payment (lease/loan). For lease this is an estimate
  // unless Tesla exposes a real quote.
  maxMonthly?: number;
  // Max acceptable total vehicle price.
  maxPrice?: number;
  // Optional trim filter, matched case-insensitively against the listing trim.
  trim?: string;
}

// A vehicle that satisfied (or came closest to) a search's criteria.
export interface MatchRecord {
  vin: string;
  model: TeslaModelCode;
  trimName: string;
  price: number;
  // Monthly payment used for matching. From Tesla's real quote when available,
  // otherwise an estimate (see monthlyIsReal).
  estimatedMonthly: number | null;
  // True when estimatedMonthly came from Tesla's listing (not our estimate).
  monthlyIsReal?: boolean;
  // Extra detail surfaced in the in-app "Tesla view".
  year?: number;
  odometer?: number;
  rangeMi?: number;
  // 0..1 — how well this listing matched the criteria (1 = full match).
  score: number;
  isMatch: boolean;
  orderUrl: string;
  // Short human-readable reason the listing did / didn't qualify.
  reason: string;
  // True when this is illustrative sample data (Tesla API was unreachable).
  sample?: boolean;
  foundAt: string;
}

export type NotifyChannel = "email" | "sms" | "browser";

export interface TrackedSearch {
  id: string;
  // What the user originally said/typed.
  rawText: string;
  models: ModelTarget[];
  financing: Financing;
  // For lease/loan: max acceptable down payment. 0 = "$0 down" offers only.
  maxDownPayment?: number;
  condition: Condition;
  // Delivery search zip + radius (miles). Defaults applied at poll time.
  zip?: string;
  radius?: number;
  active: boolean;
  channels: NotifyChannel[];

  createdAt: string;
  // Polling telemetry surfaced on the dashboard.
  lastFetchedAt?: string;
  lastStatus?: "ok" | "error" | "no-results";
  lastError?: string;
  lastInventoryCount?: number;
  // True when the latest results were sample data (Tesla unreachable).
  lastSample?: boolean;
  // Best listing seen on the most recent fetch (match or near-miss).
  closestMatch?: MatchRecord;
  // Confirmed matches awaiting / past approval.
  matches: MatchRecord[];
  // VINs we've already notified about, to avoid duplicate alerts.
  notifiedVins: string[];
  // VINs the user approved (deep-linked to checkout).
  approvedVins: string[];
}

// Result of parsing a natural-language request into structured criteria.
export interface ParsedCriteria {
  models: ModelTarget[];
  financing: Financing;
  maxDownPayment?: number;
  condition: Condition;
  zip?: string;
  radius?: number;
  // Plain-English summary the avatar reads back to confirm understanding.
  summary: string;
}
