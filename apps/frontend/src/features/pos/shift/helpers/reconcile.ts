/**
 * Till reconciliation math (Phase 1.4). Mirrors the backend's authoritative
 * computation so the close screen can show a live expected/over-short before
 * the count is submitted. Money is summed in cents to avoid float drift.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface ExpectedCashInput {
  openingCash: number;
  /** Cash the drawer actually took from sales = cash tendered − change given. */
  netCashFromSales: number;
  paidIn: number;
  paidOut: number;
}

export function expectedCash(i: ExpectedCashInput): number {
  return round2(i.openingCash + i.netCashFromSales + i.paidIn - i.paidOut);
}

/** counted − expected → positive = over, negative = short. */
export function cashDifference(countedCash: number, expected: number): number {
  return round2(countedCash - expected);
}
