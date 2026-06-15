// Lease payment estimation.
//
// Tesla's public inventory API does NOT reliably expose a real lease quote, so
// when the user tracks by monthly lease payment we estimate it from the vehicle
// price using a standard lease formula. This is an APPROXIMATION shown to the
// user as such; the real number is confirmed on Tesla's order page at approval.

export interface LeaseAssumptions {
  termMonths: number; // lease length
  residualFactor: number; // % of price retained at lease end
  moneyFactor: number; // ~ APR / 2400
  downPayment: number; // cash due at signing applied to cap cost
}

export const DEFAULT_LEASE: LeaseAssumptions = {
  termMonths: 36,
  residualFactor: 0.57, // ~57% residual is typical for a 36mo Tesla lease
  moneyFactor: 0.00125, // ~3% APR equivalent
  downPayment: 0,
};

export function estimateMonthlyLease(
  price: number,
  overrides: Partial<LeaseAssumptions> = {}
): number {
  const a = { ...DEFAULT_LEASE, ...overrides };
  const capCost = Math.max(price - a.downPayment, 0);
  const residualValue = price * a.residualFactor;
  const depreciation = (capCost - residualValue) / a.termMonths;
  const financeFee = (capCost + residualValue) * a.moneyFactor;
  const monthly = depreciation + financeFee;
  return Math.max(Math.round(monthly), 0);
}

// Rough monthly loan payment (standard amortization) for "loan" financing.
export function estimateMonthlyLoan(
  price: number,
  { termMonths = 72, apr = 0.06, downPayment = 0 } = {}
): number {
  const principal = Math.max(price - downPayment, 0);
  const r = apr / 12;
  if (r === 0) return Math.round(principal / termMonths);
  const monthly =
    (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return Math.round(monthly);
}
