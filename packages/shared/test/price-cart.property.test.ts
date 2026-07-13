import { describe, it, expect } from "vitest";
import vectors from "./vectors/canada.json";
import { priceCart, PriceLineInput } from "../src/pricing/price-cart";
import type { ProvinceCode, TaxCategory } from "../src/types/tax.types";
import { toDisplay, m } from "../src/money/money";

const at = new Date("2026-07-05");

describe("golden vectors", () => {
  it.each(vectors)("$name", (v) => {
    const line: PriceLineInput = {
      id: "l1", unitPrice: v.unitPrice, qty: v.qty, lineDiscount: "0",
      taxCategory: v.category as TaxCategory, taxInclusive: false, levies: [],
    };
    const r = priceCart({ province: v.province as ProvinceCode, at, exemption: null,
      cartDiscount: { mode: "flat", value: "0" }, lines: [line] });
    expect(toDisplay(r.taxTotal)).toBe(v.expectTaxTotal);
    expect(toDisplay(r.grandTotal)).toBe(v.expectGrand);
  });
});

describe("invariants", () => {
  const provinces: ProvinceCode[] = ["ON","QC","BC","AB","MB","SK","NS","NB","NL","PE","NT","NU","YT"];
  const cats: TaxCategory[] = ["STANDARD","ZERO_RATED","PROVINCIAL_RELIEF","EXEMPT"];

  it("grandTotal = subtotal + levyTotal + taxTotal, tax >= 0, for every province x category", () => {
    for (const province of provinces) for (const cat of cats) {
      const r = priceCart({ province, at, exemption: null, cartDiscount: { mode: "flat", value: "0" },
        lines: [{ id: "l", unitPrice: "37.49", qty: "3", lineDiscount: "2.5",
          taxCategory: cat, taxInclusive: false, levies: [] }] });
      expect(r.taxTotal.gte(0)).toBe(true);
      expect(r.grandTotal.minus(r.subtotal.plus(r.levyTotal).plus(r.taxTotal)).abs().lte(m("0.005"))).toBe(true);
    }
  });
});
