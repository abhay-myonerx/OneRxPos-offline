import { describe, it, expect } from "vitest";
import { exceedsCap } from "../src/pricing/discount-cap";

describe("exceedsCap", () => {
  it("CASHIER 10% percent cap", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "percent", value: 10, lineOrCartBase: 100 })).toBe(false);
    expect(exceedsCap({ role: "CASHIER", mode: "percent", value: 11, lineOrCartBase: 100 })).toBe(true);
  });
  it("flat discount converted to effective percent of the base", () => {
    // 50 off 100 = 50% > 10% cap
    expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 50, lineOrCartBase: 100 })).toBe(true);
    // 5 off 100 = 5% < 10% cap
    expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 5, lineOrCartBase: 100 })).toBe(false);
  });
  it("MANAGER (null caps) never exceeds", () => {
    expect(exceedsCap({ role: "MANAGER", mode: "percent", value: 99, lineOrCartBase: 100 })).toBe(false);
    expect(exceedsCap({ role: "MANAGER", mode: "flat", value: 999, lineOrCartBase: 100 })).toBe(false);
  });
  it("unknown role falls back to CASHIER", () => {
    expect(exceedsCap({ role: "GHOST", mode: "percent", value: 20, lineOrCartBase: 100 })).toBe(true);
  });
  it("flat on a zero base with a positive value → exceeds (infinite effective %)", () => {
    expect(exceedsCap({ role: "CASHIER", mode: "flat", value: 5, lineOrCartBase: 0 })).toBe(true);
  });
});
