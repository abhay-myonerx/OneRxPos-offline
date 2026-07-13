import { describe, it, expect } from "vitest";
import { exceedsCap, DEFAULT_ROLE_CAPS } from "../discount-cap";

const base = { caps: DEFAULT_ROLE_CAPS };

describe("exceedsCap", () => {
  it("cashier 10% discount is within the 10% cap", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "percent", value: 10, lineOrCartBase: 100, ...base })).toBe(false);
  });
  it("cashier 15% discount exceeds the 10% cap", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "percent", value: 15, lineOrCartBase: 100, ...base })).toBe(true);
  });
  it("cashier $15 flat on a $100 line = 15% effective -> exceeds", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 15, lineOrCartBase: 100, ...base })).toBe(true);
  });
  it("cashier $8 flat on a $100 line = 8% effective -> within", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 8, lineOrCartBase: 100, ...base })).toBe(false);
  });
  it("manager is unlimited", () => {
    expect(exceedsCap({ role: "MANAGER", mode: "percent", value: 90, lineOrCartBase: 100, ...base })).toBe(false);
  });
  it("unknown role is treated as cashier (restrictive)", () => {
    expect(exceedsCap({ role: "WHATEVER", mode: "percent", value: 15, lineOrCartBase: 100, ...base })).toBe(true);
  });
  it("cashier 5% discount is clearly within the 10% cap", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "percent", value: 5, lineOrCartBase: 100, ...base })).toBe(false);
  });
  it("zero-value flat discount on a zero base is a no-op, not over-cap", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 0, lineOrCartBase: 0, ...base })).toBe(false);
  });

  describe("flat-dollar cap axis", () => {
    const flatCaps = { CASHIER: { percent: null, flat: 20 } };
    it("$20 flat on a $200 line is within the $20 flat cap", () => {
      expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 20, lineOrCartBase: 200, caps: flatCaps })).toBe(false);
    });
    it("$25 flat on a $200 line exceeds the $20 flat cap", () => {
      expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 25, lineOrCartBase: 200, caps: flatCaps })).toBe(true);
    });
  });
});
