import { describe, it, expect } from "vitest";
import { m } from "../src/money/money";
import { computeLevy } from "../src/pricing/levies";
import type { Levy } from "../src/types/tax.types";

const levy = (mode: Levy["mode"], amount: string): Levy =>
  ({ code: "X", name: "X", mode, amount, taxable: true });

describe("computeLevy", () => {
  it("FLAT_PER_UNIT multiplies by qty", () => {
    expect(computeLevy(levy("FLAT_PER_UNIT", "0.10"), m("20"), m(3)).toString()).toBe("0.3");
  });
  it("FLAT_PER_LINE is a single charge regardless of qty", () => {
    expect(computeLevy(levy("FLAT_PER_LINE", "1.50"), m("20"), m(3)).toString()).toBe("1.5");
  });
  it("PERCENT applies to the line net", () => {
    expect(computeLevy(levy("PERCENT", "10"), m("20"), m(3)).toString()).toBe("2");
  });
});
