import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export type MoneyInput = number | string | Decimal;

export function m(value: MoneyInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "object" && value !== null && "toString" in value) {
    return new Decimal((value as { toString(): string }).toString());
  }
  return new Decimal(value as number | string);
}

/** Round to 4 dp half-even for persistence (matches Decimal(12,4)). */
export function toDbNumber(d: Decimal): number {
  return d.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toNumber();
}

/** Alias of toDbNumber for API submission from the frontend. */
export const toApiNumber = toDbNumber;

/** Format to `dp` decimal places (default 2) half-even. */
export function toDisplay(d: Decimal, dp = 2): string {
  return d.toDecimalPlaces(dp, Decimal.ROUND_HALF_EVEN).toFixed(dp);
}

export interface TaxResult {
  net: Decimal;
  tax: Decimal;
  gross: Decimal;
}

export function computeTax(
  amount: MoneyInput,
  taxRatePct: MoneyInput,
  isInclusive: boolean,
): TaxResult {
  const amt = m(amount);
  const rate = m(taxRatePct);
  if (rate.isZero()) return { net: amt, tax: m(0), gross: amt };
  if (isInclusive) {
    const divisor = m(100).plus(rate).div(100);
    const net = amt.div(divisor);
    return { net, tax: amt.minus(net), gross: amt };
  }
  const tax = amt.times(rate).div(100);
  return { net: amt, tax, gross: amt.plus(tax) };
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, v) => acc.plus(v), m(0));
}

export function gt(a: MoneyInput, b: MoneyInput): boolean {
  return m(a).gt(m(b));
}
export function gte(a: MoneyInput, b: MoneyInput): boolean {
  return m(a).gte(m(b));
}
export function max(a: MoneyInput, b: MoneyInput): Decimal {
  return Decimal.max(m(a), m(b));
}
export function min(a: MoneyInput, b: MoneyInput): Decimal {
  return Decimal.min(m(a), m(b));
}

export { Decimal };
