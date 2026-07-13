import {
  priceCart,
  roundCashDue,
  m,
  sum,
  max as dmax,
  Decimal,
  type PriceLineInput,
  type ProvinceCode,
} from "rx-pos-shared";
import type { CartItem } from "../types/cart.types";

export interface CartTotals {
  /** Pre-tax, pre-discount sum of line nets (unit price × qty, tax extracted if inclusive). */
  subtotal: Decimal;
  /** Sum of per-line discounts. */
  itemDiscount: Decimal;
  /** Cart-level discount resolved to an absolute amount. */
  cartDiscount: Decimal;
  /** itemDiscount + cartDiscount (levies are NOT folded in). */
  totalDiscount: Decimal;
  /** Levies (environmental fees, etc.) — informational; already folded into grandTotal. */
  levyTotal: Decimal;
  /** Sum of tax across all lines (after discounts), rx-pos-shared's `priceCart` output. */
  taxTotal: Decimal;
  /** What the customer pays: subtotal - totalDiscount + levyTotal + taxTotal. */
  grandTotal: Decimal;
  /** Total units in cart. */
  totalQty: number;
}

function zeroTotals(items: CartItem[]): CartTotals {
  // Even without a resolved province we still show a subtotal (unit price × qty,
  // net of line discounts) so the UI isn't blank — tax is zeroed and the UI is
  // expected to show a "set province" banner rather than guess at tax. The
  // backend is the authoritative, fail-closed source of truth at checkout.
  const subtotal = sum(items.map((i) => m(i.unitPrice).times(i.quantity).minus(i.discount)));
  const itemDiscount = sum(items.map((i) => m(i.discount)));
  const totalQty = items.reduce((n, i) => n + i.quantity, 0);
  return {
    subtotal: dmax(0, subtotal),
    itemDiscount,
    cartDiscount: m(0),
    totalDiscount: itemDiscount,
    levyTotal: m(0),
    taxTotal: m(0),
    grandTotal: dmax(0, subtotal),
    totalQty,
  };
}

/**
 * Cart totals delegate to the shared `priceCart` engine (rx-pos-shared) — the
 * SAME pricing brain the backend uses at checkout — so the number a cashier
 * sees on screen matches what gets persisted, down to the cent. `province`
 * comes from the active store (`cart.storeProvince`); when it's not yet
 * resolved we fail SOFT here (zeroed tax, real subtotal) since this is only a
 * cart preview — the backend fails CLOSED and refuses to checkout without one.
 */
export function computeCartTotals(
  items: CartItem[],
  cartDiscountInput: number,
  cartDiscountMode: "flat" | "percent",
  province: ProvinceCode | null,
): CartTotals {
  if (items.length === 0 || province === null) {
    return zeroTotals(items);
  }

  const lines: PriceLineInput[] = items.map((i) => ({
    id: i.id,
    unitPrice: String(i.unitPrice),
    qty: String(i.quantity),
    lineDiscount: String(i.discount),
    taxCategory: i.taxCategory,
    taxInclusive: i.taxInclusive,
    levies: i.levies,
  }));

  const priced = priceCart({
    province,
    at: new Date(),
    exemption: null,
    cartDiscount: { mode: cartDiscountMode, value: String(cartDiscountInput) },
    lines,
  });

  const itemDiscount = sum(items.map((i) => m(i.discount)));
  const cartDiscount = dmax(0, priced.discountTotal.minus(itemDiscount));
  const totalQty = items.reduce((n, i) => n + i.quantity, 0);

  return {
    subtotal: priced.subtotal.plus(priced.discountTotal),
    itemDiscount,
    cartDiscount,
    totalDiscount: priced.discountTotal,
    levyTotal: priced.levyTotal,
    taxTotal: priced.taxTotal,
    grandTotal: priced.grandTotal,
    totalQty,
  };
}

/**
 * Cash-only change calculation. Non-cash payments (card, mobile, gift card)
 * never produce change from the drawer, and are never nickel-rounded — only
 * cash is subject to the Royal Canadian Mint's rounding rule (mirrors the
 * backend's `processCheckout`, see checkout.service.ts).
 */
export function computeChange(
  payments: Array<{ method: string; amount: number }>,
  grandTotal: Decimal,
): { totalPaid: Decimal; changeAmount: Decimal; dueAmount: Decimal } {
  const totalPaid = sum(payments.map((p) => m(p.amount)));
  const cashPaid = sum(payments.filter((p) => p.method === "CASH").map((p) => m(p.amount)));
  const nonCashPaid = totalPaid.minus(cashPaid);

  let cashDue = m(0);
  if (cashPaid.gt(0)) {
    const rawCashDue = dmax(0, grandTotal.minus(nonCashPaid));
    ({ rounded: cashDue } = roundCashDue(rawCashDue));
  }

  const changeAmount = dmax(0, cashPaid.minus(cashDue));
  const paidAmount = dmax(0, totalPaid.minus(changeAmount));
  const dueAmount = dmax(0, grandTotal.minus(paidAmount));

  return { totalPaid, changeAmount, dueAmount };
}
