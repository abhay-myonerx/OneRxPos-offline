import { describe, it, expect } from "vitest";
import { resolveRedemption, resolveTierMultiplier } from "../loyalty";

describe("resolveRedemption", () => {
  const base = { redeemRate: 0.1, minRedeemPoints: 100, availablePoints: 500, grandTotal: 100 };

  it("returns points + dollar value on a valid redemption", () => {
    expect(resolveRedemption({ ...base, redeemPoints: 200 })).toEqual({ points: 200, value: 20 });
  });
  it("rejects below the minimum", () => {
    expect(() => resolveRedemption({ ...base, redeemPoints: 50 })).toThrow(/Minimum/);
  });
  it("rejects redeeming more than the customer holds", () => {
    expect(() => resolveRedemption({ ...base, redeemPoints: 600 })).toThrow(/Not enough/);
  });
  it("rejects a value exceeding the sale total", () => {
    // 2000 points * 0.1 = $200 > $100 total
    expect(() => resolveRedemption({ ...base, availablePoints: 5000, redeemPoints: 2000 })).toThrow(/exceed the sale total/);
  });
  it("rejects non-positive / non-integer points", () => {
    expect(() => resolveRedemption({ ...base, redeemPoints: 0 })).toThrow();
    expect(() => resolveRedemption({ ...base, redeemPoints: 100.5 })).toThrow();
  });
});

describe("resolveTierMultiplier", () => {
  const tiers = [
    { minSpend: 50, multiplier: 1.5 },
    { minSpend: 100, multiplier: 2 },
  ];
  it("empty tiers → 1", () => {
    expect(resolveTierMultiplier([], 999)).toBe(1);
  });
  it("below the smallest tier → 1", () => {
    expect(resolveTierMultiplier(tiers, 40)).toBe(1);
  });
  it("picks the highest matching tier", () => {
    expect(resolveTierMultiplier(tiers, 60)).toBe(1.5);
    expect(resolveTierMultiplier(tiers, 120)).toBe(2);
    expect(resolveTierMultiplier(tiers, 100)).toBe(2); // exactly at threshold
  });
});
