import { describe, it, expect } from "vitest";
import { categoryTreatment, resolveTreatment } from "../src/tax/treatment";

describe("two-axis treatment", () => {
  it("STANDARD = both axes taxable", () => {
    expect(categoryTreatment("STANDARD")).toEqual({ FEDERAL: "TAXABLE", PROVINCIAL: "TAXABLE" });
  });
  it("ZERO_RATED = both axes zero", () => {
    expect(categoryTreatment("ZERO_RATED")).toEqual({ FEDERAL: "ZERO", PROVINCIAL: "ZERO" });
  });
  it("PROVINCIAL_RELIEF = federal taxable, provincial zero", () => {
    expect(categoryTreatment("PROVINCIAL_RELIEF")).toEqual({ FEDERAL: "TAXABLE", PROVINCIAL: "ZERO" });
  });
  it("EXEMPT = both axes exempt", () => {
    expect(categoryTreatment("EXEMPT")).toEqual({ FEDERAL: "EXEMPT", PROVINCIAL: "EXEMPT" });
  });

  it("FIRST_NATIONS exemption relieves provincial only, keeps federal", () => {
    const r = resolveTreatment("STANDARD", "FIRST_NATIONS", "ON");
    expect(r).toEqual({ FEDERAL: "TAXABLE", PROVINCIAL: "ZERO" });
  });
  it("DIPLOMATIC exemption relieves both axes", () => {
    const r = resolveTreatment("STANDARD", "DIPLOMATIC", "ON");
    expect(r).toEqual({ FEDERAL: "EXEMPT", PROVINCIAL: "EXEMPT" });
  });
  it("takes the more-relieving axis when category already relieves", () => {
    // ZERO_RATED (both ZERO) vs FIRST_NATIONS (provincial ZERO) -> federal stays ZERO
    const r = resolveTreatment("ZERO_RATED", "FIRST_NATIONS", "ON");
    expect(r).toEqual({ FEDERAL: "ZERO", PROVINCIAL: "ZERO" });
  });
  it("no exemption returns the category treatment unchanged", () => {
    const r = resolveTreatment("PROVINCIAL_RELIEF", null, "BC");
    expect(r).toEqual({ FEDERAL: "TAXABLE", PROVINCIAL: "ZERO" });
  });
});
