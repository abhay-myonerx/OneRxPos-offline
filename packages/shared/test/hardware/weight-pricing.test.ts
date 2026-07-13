import { describe, it, expect } from "vitest";
import {
  convertWeight,
  applyTare,
  weightPriceCents,
  isSellableWeight,
} from "../../src/hardware/weight-pricing";

describe("weight pricing", () => {
  it("converts between units", () => {
    expect(convertWeight(1000, "g", "kg")).toBeCloseTo(1, 6);
    expect(convertWeight(1, "kg", "lb")).toBeCloseTo(2.20462, 4);
    expect(convertWeight(16, "oz", "lb")).toBeCloseTo(1, 6);
  });

  it("applies tare, clamped at zero", () => {
    expect(applyTare(1.5, 0.2)).toBeCloseTo(1.3, 6);
    expect(applyTare(0.1, 0.5)).toBe(0);
  });

  it("prices unit-price × weight, rounded to the cent", () => {
    // $5.00/kg × 1.5 kg = $7.50
    expect(weightPriceCents(500, 1.5, "kg", "kg")).toBe(750);
    // $5.00/kg × 1000 g = $5.00
    expect(weightPriceCents(500, 1000, "g", "kg")).toBe(500);
    // rounds to nearest cent: 299 * 0.333 = 99.567 → 100
    expect(weightPriceCents(299, 0.333, "kg", "kg")).toBe(100);
  });

  it("is sellable only when stable and positive", () => {
    expect(isSellableWeight({ value: 1, unit: "kg", stable: true })).toBe(true);
    expect(isSellableWeight({ value: 1, unit: "kg", stable: false })).toBe(false);
    expect(isSellableWeight({ value: 0, unit: "kg", stable: true })).toBe(false);
  });
});
