import { describe, it, expect } from "vitest";
import { priceCart } from "../src/pricing/price-cart";
import type { PriceLineInput } from "../src/pricing/price-cart";
import { toDisplay } from "../src/money/money";

const line = (over: Partial<PriceLineInput>): PriceLineInput => ({
  id: "l1", unitPrice: "100", qty: "1", lineDiscount: "0",
  taxCategory: "STANDARD", taxInclusive: false, levies: [], ...over,
});
const base = { at: new Date("2026-07-05"), exemption: null as null,
  cartDiscount: { mode: "flat" as const, value: "0" } };

describe("priceCart", () => {
  it("ON STANDARD $100 -> HST 13 -> grand 113", () => {
    const r = priceCart({ ...base, province: "ON", lines: [line({})] });
    expect(toDisplay(r.subtotal)).toBe("100.00");
    expect(toDisplay(r.taxTotal)).toBe("13.00");
    expect(toDisplay(r.grandTotal)).toBe("113.00");
    const hst = r.taxBreakdown.find((t) => t.code === "HST");
    expect(hst?.amount.toFixed(2)).toBe("13.00");
    expect(hst?.base.toFixed(2)).toBe("100.00");
    expect(hst?.ratePct).toBe("13");
    expect(r.taxBreakdown.filter((t) => t.code === "HST").length).toBe(1);
  });

  it("BC STANDARD $100 -> GST 5 + PST 7 -> grand 112", () => {
    const r = priceCart({ ...base, province: "BC", lines: [line({})] });
    expect(toDisplay(r.taxTotal)).toBe("12.00");
    const gst = r.taxBreakdown.find((t) => t.code === "GST");
    const pst = r.taxBreakdown.find((t) => t.code === "PST");
    expect(gst?.amount.toFixed(2)).toBe("5.00");
    expect(gst?.base.toFixed(2)).toBe("100.00");
    expect(gst?.ratePct).toBe("5");
    expect(pst?.amount.toFixed(2)).toBe("7.00");
    expect(pst?.base.toFixed(2)).toBe("100.00");
    expect(pst?.ratePct).toBe("7");
  });

  it("ON ZERO_RATED (Rx) -> no tax", () => {
    const r = priceCart({ ...base, province: "ON", lines: [line({ taxCategory: "ZERO_RATED" })] });
    expect(toDisplay(r.taxTotal)).toBe("0.00");
    expect(toDisplay(r.grandTotal)).toBe("100.00");
  });

  it("ON PROVINCIAL_RELIEF -> only federal 5% of HST", () => {
    const r = priceCart({ ...base, province: "ON", lines: [line({ taxCategory: "PROVINCIAL_RELIEF" })] });
    expect(toDisplay(r.taxTotal)).toBe("5.00");
  });

  it("BC FIRST_NATIONS exemption drops PST, keeps GST", () => {
    const r = priceCart({ ...base, province: "BC", exemption: "FIRST_NATIONS", lines: [line({})] });
    expect(toDisplay(r.taxTotal)).toBe("5.00");
  });

  it("QC STANDARD $100 -> GST 5 + QST 9.975 (non-compound) -> 14.98", () => {
    const r = priceCart({ ...base, province: "QC", lines: [line({})] });
    expect(r.taxBreakdown.find((t) => t.code === "QST")?.amount.toFixed(2)).toBe("9.98");
    expect(toDisplay(r.grandTotal)).toBe("114.98");
  });

  it("taxable per-unit levy folds into the taxable base before tax (ON)", () => {
    const r = priceCart({ ...base, province: "ON", lines: [line({
      qty: "2",
      levies: [{ code: "ECO", name: "Eco fee", mode: "FLAT_PER_UNIT", amount: "1.00", taxable: true }],
    })] });
    // net = 200, levy = 2 (taxable) -> base 202 -> HST 26.26 -> grand 228.26
    expect(toDisplay(r.levyTotal)).toBe("2.00");
    const hst = r.taxBreakdown.find((t) => t.code === "HST");
    expect(hst?.amount.toFixed(2)).toBe("26.26");
    expect(hst?.base.toFixed(2)).toBe("202.00");
    expect(hst?.ratePct).toBe("13");
    expect(toDisplay(r.grandTotal)).toBe("228.26");
  });

  it("non-taxable levy adds after tax", () => {
    const r = priceCart({ ...base, province: "ON", lines: [line({
      levies: [{ code: "DEP", name: "Deposit", mode: "FLAT_PER_LINE", amount: "0.10", taxable: false }],
    })] });
    // net 100 -> HST 13 -> +0.10 deposit -> 113.10
    expect(toDisplay(r.grandTotal)).toBe("113.10");
  });

  it("tax-inclusive line backs out net then re-taxes consistently (ON)", () => {
    const r = priceCart({ ...base, province: "ON", lines: [line({ unitPrice: "113", taxInclusive: true })] });
    expect(toDisplay(r.subtotal)).toBe("100.00");
    expect(toDisplay(r.taxTotal)).toBe("13.00");
    expect(toDisplay(r.grandTotal)).toBe("113.00");
  });

  it("per-tax-type rounding: two lines rounded once per component, not per line", () => {
    // QC, two $10.10 lines. Per-line QST = 1.007475 each -> rounded per line 1.01+1.01=2.02;
    // per-total = 2.01495 -> 2.01. Assert the per-total behaviour.
    const r = priceCart({ ...base, province: "QC", lines: [line({ unitPrice: "10.10" }), line({ id: "l2", unitPrice: "10.10" })] });
    expect(r.taxBreakdown.find((t) => t.code === "QST")?.amount.toFixed(2)).toBe("2.01");
  });
});
