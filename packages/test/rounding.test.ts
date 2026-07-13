import { describe, it, expect } from "vitest";
import { m } from "../src/money/money";
import { roundCashDue } from "../src/pricing/rounding";

const cases: Array<[string, string, string]> = [
  // [amount, expectedRounded, expectedAdjustment]
  ["10.01", "10.00", "-0.01"],
  ["10.02", "10.00", "-0.02"],
  ["10.03", "10.05", "0.02"],
  ["10.04", "10.05", "0.01"],
  ["10.05", "10.05", "0"],
  ["10.06", "10.05", "-0.01"],
  ["10.07", "10.05", "-0.02"],
  ["10.08", "10.10", "0.02"],
  ["10.09", "10.10", "0.01"],
  ["10.00", "10.00", "0"],
];

describe("nickel rounding (RCM)", () => {
  it.each(cases)("%s -> %s (adj %s)", (amt, rounded, adj) => {
    const r = roundCashDue(m(amt));
    expect(r.rounded.toFixed(2)).toBe(m(rounded).toFixed(2));
    expect(r.adjustment.toString()).toBe(adj);
  });

  it("adjustment always within [-0.02, 0.02]", () => {
    for (let c = 0; c < 100; c++) {
      const r = roundCashDue(m(`5.${String(c).padStart(2, "0")}`));
      expect(r.adjustment.abs().lte(m("0.02"))).toBe(true);
    }
  });
});
