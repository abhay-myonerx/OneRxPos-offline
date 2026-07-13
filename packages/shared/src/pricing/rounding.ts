import { Decimal } from "../money/money";

/**
 * Round a cash-due amount to the nearest $0.05 using the Royal Canadian Mint
 * rule (round-half-up at the 2.5-cent boundary). Returns the rounded amount
 * and the signed adjustment (rounded - amount), always within [-0.02, 0.02].
 */
export function roundCashDue(amount: Decimal): { rounded: Decimal; adjustment: Decimal } {
  const rounded = amount
    .div("0.05")
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .times("0.05");
  return { rounded, adjustment: rounded.minus(amount) };
}
