import { describe, it, expect } from "vitest";
import { computeCartTotals, computeChange } from "../checkout-math";
import type { CartItem } from "../../types/cart.types";

const item = (over: Partial<CartItem>): CartItem => ({
  id: "1",
  productId: "p1",
  name: "x",
  sku: "x",
  unitPrice: 100,
  costPrice: 0,
  quantity: 1,
  discount: 0,
  taxCategory: "STANDARD",
  taxInclusive: false,
  levies: [],
  maxStock: 99,
  ...over,
});

describe("computeCartTotals via shared engine", () => {
  it("ON $100 STANDARD -> grand 113.00, tax 13.00", () => {
    const t = computeCartTotals([item({})], 0, "flat", "ON");
    expect(t.grandTotal.toFixed(2)).toBe("113.00");
    expect(t.taxTotal.toFixed(2)).toBe("13.00");
    expect(t.subtotal.toFixed(2)).toBe("100.00");
  });

  it("no province set -> zero tax, but subtotal is still computed (fail-soft in UI)", () => {
    const t = computeCartTotals([item({ unitPrice: 50, quantity: 2 })], 0, "flat", null);
    expect(t.taxTotal.toFixed(2)).toBe("0.00");
    expect(t.subtotal.toFixed(2)).toBe("100.00");
    expect(t.grandTotal.toFixed(2)).toBe("100.00");
  });

  it("empty cart -> all zero totals regardless of province", () => {
    const t = computeCartTotals([], 0, "flat", "ON");
    expect(t.subtotal.toFixed(2)).toBe("0.00");
    expect(t.taxTotal.toFixed(2)).toBe("0.00");
    expect(t.grandTotal.toFixed(2)).toBe("0.00");
    expect(t.totalQty).toBe(0);
  });

  it("BC $10.03 STANDARD -> GST 0.50 + PST 0.70 = 1.20 tax, real Decimal from the shared engine", () => {
    const t = computeCartTotals([item({ unitPrice: 10.03 })], 0, "flat", "BC");
    expect(t.taxTotal.toFixed(2)).toBe("1.20");
    expect(t.grandTotal.toFixed(2)).toBe("11.23");
  });

  it("ON $100 ZERO_RATED -> no tax charged at all", () => {
    const t = computeCartTotals([item({ taxCategory: "ZERO_RATED" })], 0, "flat", "ON");
    expect(t.taxTotal.toFixed(2)).toBe("0.00");
    expect(t.grandTotal.toFixed(2)).toBe("100.00");
  });

  it("totalQty sums quantities across lines", () => {
    const t = computeCartTotals(
      [item({ id: "1", quantity: 2 }), item({ id: "2", quantity: 3 })],
      0,
      "flat",
      "ON",
    );
    expect(t.totalQty).toBe(5);
  });

  it("multi-line ON cart with a $10 FLAT cart discount: subtotal stays pre-discount and the receipt waterfall reconciles", () => {
    const t = computeCartTotals(
      [item({ id: "1", unitPrice: 60 }), item({ id: "2", unitPrice: 40 })],
      10,
      "flat",
      "ON",
    );
    // Pre-discount subtotal: 60 + 40 = 100.00 (NOT netted against the cart discount).
    expect(t.subtotal.toFixed(2)).toBe("100.00");
    // itemDiscount (0) + cartDiscount (10) = 10.00.
    expect(t.totalDiscount.toFixed(2)).toBe("10.00");
    // Tax is charged on the post-discount base: (100 - 10) * 13% = 11.70.
    expect(t.taxTotal.toFixed(2)).toBe("11.70");
    expect(t.grandTotal.toFixed(2)).toBe("101.70");
    // The waterfall a cashier sees on screen must reconcile to the actual total.
    expect(t.subtotal.minus(t.totalDiscount).plus(t.taxTotal).toFixed(2)).toBe(
      t.grandTotal.toFixed(2),
    );
  });

  it("multi-line ON cart with a 10% PERCENT cart discount: same reconciliation invariant holds", () => {
    const t = computeCartTotals(
      [item({ id: "1", unitPrice: 60 }), item({ id: "2", unitPrice: 40 })],
      10,
      "percent",
      "ON",
    );
    // Pre-discount subtotal: 60 + 40 = 100.00.
    expect(t.subtotal.toFixed(2)).toBe("100.00");
    // 10% of 100 = 10.00 cart discount, no item discount.
    expect(t.totalDiscount.toFixed(2)).toBe("10.00");
    expect(t.taxTotal.toFixed(2)).toBe("11.70");
    expect(t.grandTotal.toFixed(2)).toBe("101.70");
    expect(t.subtotal.minus(t.totalDiscount).plus(t.taxTotal).toFixed(2)).toBe(
      t.grandTotal.toFixed(2),
    );
  });
});

describe("computeChange", () => {
  it("rounds cash-due to the nearest nickel and computes change/due against the rounded amount", () => {
    // grandTotal 11.23 tendered in cash: cash due rounds to 11.25 (Mint rule).
    const t = computeCartTotals([item({ unitPrice: 10.03 })], 0, "flat", "BC");
    const result = computeChange([{ method: "CASH", amount: 11.25 }], t.grandTotal);
    expect(result.totalPaid.toFixed(2)).toBe("11.25");
    expect(result.changeAmount.toFixed(2)).toBe("0.00");
    expect(result.dueAmount.toFixed(2)).toBe("0.00");
  });

  it("non-cash tenders are never nickel-rounded", () => {
    const t = computeCartTotals([item({ unitPrice: 10.03 })], 0, "flat", "BC");
    const result = computeChange([{ method: "CARD", amount: 11.23 }], t.grandTotal);
    expect(result.dueAmount.toFixed(2)).toBe("0.00");
  });
});
