import { describe, it, expect } from "vitest";
import { countTotal, CAD_DENOMINATIONS } from "../denominations";
import { expectedCash, cashDifference } from "../reconcile";

describe("countTotal", () => {
  it("sums bills and coins without float drift", () => {
    // 5×$20 + 3×$10 + 12×$5 + 8×$1 + 6×25¢ + 3×5¢ = 100+30+60+8+1.5+0.15 = 199.65
    const total = countTotal({ "20": 5, "10": 3, "5": 12, "1": 8, "0.25": 6, "0.05": 3 });
    expect(total).toBeCloseTo(199.65, 5);
  });
  it("ignores empty/negative counts and unknown keys", () => {
    expect(countTotal({ "100": 0, "20": 2, "5": -1 })).toBe(40);
    expect(countTotal({})).toBe(0);
  });
  it("covers every CAD denomination once = $188.40", () => {
    const one = Object.fromEntries(CAD_DENOMINATIONS.map((d) => [d.key, 1]));
    // 100+50+20+10+5+2+1+0.25+0.10+0.05 = 188.40
    expect(countTotal(one)).toBeCloseTo(188.4, 5);
  });
});

describe("expectedCash + cashDifference", () => {
  it("float + net cash sales + paid-in − paid-out", () => {
    const exp = expectedCash({ openingCash: 200, netCashFromSales: 317.4, paidIn: 0, paidOut: 50 });
    expect(exp).toBeCloseTo(467.4, 5);
  });
  it("difference is over (+) / short (−)", () => {
    expect(cashDifference(470, 467.4)).toBeCloseTo(2.6, 5); // over
    expect(cashDifference(465, 467.4)).toBeCloseTo(-2.4, 5); // short
    expect(cashDifference(467.4, 467.4)).toBe(0);
  });
});
