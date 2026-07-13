// Pure unit tests for the Phase 1.4 denomination-count total (`countTotal`).

import { describe, it, expect } from "vitest";
import { countTotal } from "../cash-math";

describe("countTotal", () => {
  it("returns 0 for an empty / null / undefined count map", () => {
    expect(countTotal({})).toBe(0);
    expect(countTotal(null)).toBe(0);
    expect(countTotal(undefined)).toBe(0);
  });

  it("totals CAD bills only", () => {
    // 2×$100 + 1×$50 + 3×$20 = 200 + 50 + 60 = 310
    expect(countTotal({ "100": 2, "50": 1, "20": 3 })).toBe(310);
  });

  it("totals coins (fractional denominations) without cent drift", () => {
    // 4×0.25 + 3×0.10 + 5×0.05 = 1.00 + 0.30 + 0.25 = 1.55
    expect(countTotal({ "0.25": 4, "0.10": 3, "0.05": 5 })).toBe(1.55);
  });

  it("totals a mixed bills + coins float (a typical $200 opening float)", () => {
    // 1×100 + 1×50 + 2×20 + 1×5 + 2×2 + 1×1 = 100+50+40+5+4+1 = 200
    const counts = { "100": 1, "50": 1, "20": 2, "5": 1, "2": 2, "1": 1 };
    expect(countTotal(counts)).toBe(200);
  });

  it("ignores zero-count denominations", () => {
    expect(countTotal({ "100": 0, "50": 2, "20": 0 })).toBe(100);
  });

  it("handles a full CAD denomination set", () => {
    // 1 of every CAD denom: 100+50+20+10+5+2+1+0.25+0.10+0.05 = 188.40
    const counts = {
      "100": 1,
      "50": 1,
      "20": 1,
      "10": 1,
      "5": 1,
      "2": 1,
      "1": 1,
      "0.25": 1,
      "0.10": 1,
      "0.05": 1,
    };
    expect(countTotal(counts)).toBe(188.4);
  });
});
