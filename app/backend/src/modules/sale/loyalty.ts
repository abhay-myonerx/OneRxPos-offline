// 3H.5 loyalty redemption + tier earn — pure helpers used by checkout.
// `resolveRedemption` validates a redemption fail-closed and returns the applied
// points + dollar value. `resolveTierMultiplier` picks the earn multiplier for a
// sale amount. Both are DB-free and unit-tested in isolation.

import { ValidationError } from "../../shared/errors";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function resolveRedemption(args: {
  redeemRate: number; // dollars of value per point
  minRedeemPoints: number;
  availablePoints: number;
  redeemPoints: number;
  grandTotal: number;
}): { points: number; value: number } {
  const { redeemRate, minRedeemPoints, availablePoints, redeemPoints, grandTotal } = args;
  if (!Number.isInteger(redeemPoints) || redeemPoints <= 0) {
    throw new ValidationError("Redeem points must be a positive whole number");
  }
  if (redeemPoints < minRedeemPoints) {
    throw new ValidationError(`Minimum redemption is ${minRedeemPoints} points`);
  }
  if (redeemPoints > availablePoints) {
    throw new ValidationError("Not enough loyalty points to redeem");
  }
  const value = round2(redeemPoints * redeemRate);
  if (value > grandTotal + 1e-9) {
    throw new ValidationError("Redemption value cannot exceed the sale total");
  }
  return { points: redeemPoints, value };
}

export function resolveTierMultiplier(
  tiers: Array<{ minSpend: number; multiplier: number }>,
  basis: number,
): number {
  let best = 1;
  let bestMinSpend = -Infinity;
  for (const t of tiers) {
    if (basis + 1e-9 >= t.minSpend && t.minSpend > bestMinSpend) {
      best = t.multiplier;
      bestMinSpend = t.minSpend;
    }
  }
  return best;
}
