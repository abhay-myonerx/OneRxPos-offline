// Pure reconciliation math for the till session (Phase 1.4).
//
// Denomination counts are a `Record<string, number>` where the key is the
// denomination VALUE as a string ("100","50","20","10","5","2","1","0.25",
// "0.10","0.05") and the value is how many of that denomination were counted.
// All money is folded through decimal.js (the same engine checkout uses) and
// rounded to 2 decimal places so cents never drift.

import { m } from "../../shared/utils/money";

export type DenominationCounts = Record<string, number>;

/**
 * countTotal(counts) = Σ ( parseFloat(key) × count ), rounded to 2 dp.
 *
 * Non-numeric keys and non-finite values contribute 0 (defensive — the zod
 * schema already enforces string keys / non-negative int values at the edge).
 */
export function countTotal(counts: DenominationCounts | null | undefined): number {
  if (!counts) return 0;

  let total = m(0);
  for (const [denom, count] of Object.entries(counts)) {
    const value = Number.parseFloat(denom);
    if (!Number.isFinite(value) || !Number.isFinite(count)) continue;
    total = total.plus(m(value).times(count));
  }
  // 2 dp, round-half-up — matches the money engine's display rounding.
  return Number(total.toDecimalPlaces(2).toFixed(2));
}
