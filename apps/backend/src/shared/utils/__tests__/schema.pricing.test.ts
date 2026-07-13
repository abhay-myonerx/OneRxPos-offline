import { describe, it, expect } from "vitest";
import { TaxCategory, LevyMode, ProvinceCode } from "../../../generated/prisma/enums";

describe("pricing schema enums generated", () => {
  it("TaxCategory has the four categories", () => {
    expect(Object.values(TaxCategory).sort()).toEqual(
      ["EXEMPT", "PROVINCIAL_RELIEF", "STANDARD", "ZERO_RATED"]);
  });
  it("LevyMode + ProvinceCode present", () => {
    expect(LevyMode.FLAT_PER_UNIT).toBe("FLAT_PER_UNIT");
    expect(ProvinceCode.ON).toBe("ON");
  });
});
