import { describe, it, expect } from "vitest";
import { m, sum, toDbNumber, toDisplay, computeTax, Decimal } from "../src/money/money";

describe("money primitives", () => {
  it("m() wraps numbers, strings, and Decimals exactly", () => {
    expect(m(1.1).plus(m("2.2")).toString()).toBe("3.3");
    expect(m(new Decimal("0.1")).plus(m(0.2)).toString()).toBe("0.3");
  });

  it("sum() adds an array with no float drift", () => {
    expect(sum([m(0.1), m(0.2), m(0.3)]).toString()).toBe("0.6");
  });

  it("toDbNumber() rounds to 4 dp half-even", () => {
    expect(toDbNumber(m("1.23455"))).toBe(1.2346);
    expect(toDbNumber(m("1.23445"))).toBe(1.2344);
  });

  it("toDisplay() formats 2 dp", () => {
    expect(toDisplay(m("1.005"))).toBe("1.00"); // half-even
    expect(toDisplay(m("2.5"))).toBe("2.50");
  });

  it("computeTax() exclusive adds tax on top", () => {
    const r = computeTax("100", "13", false);
    expect(r.net.toString()).toBe("100");
    expect(r.tax.toString()).toBe("13");
    expect(r.gross.toString()).toBe("113");
  });

  it("computeTax() inclusive backs tax out", () => {
    const r = computeTax("113", "13", true);
    expect(toDisplay(r.net)).toBe("100.00");
    expect(toDisplay(r.tax)).toBe("13.00");
  });
});
