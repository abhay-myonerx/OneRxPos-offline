import { describe, it, expect } from "vitest";

import { pharmacyModule, registerPharmacySector } from "../index";
import { createSectorRegistry } from "../../core/registry";
import { sectorRegistry } from "../../core/registry";
// Importing the barrel triggers idempotent registration into the default registry.
import "../../index";

describe("pharmacy sector", () => {
  it("is registered in the default registry on barrel import", () => {
    expect(sectorRegistry.has("pharmacy")).toBe(true);
    expect(sectorRegistry.get("pharmacy")?.label).toBe("Pharmacy");
  });

  it("has a schedule-enforcement compliance hook (Phase 2.2), no checkout steps", () => {
    expect(pharmacyModule.checkoutSteps).toBeUndefined();
    expect(pharmacyModule.complianceHooks).toHaveLength(1);
    expect(pharmacyModule.complianceHooks?.[0].id).toBe("pharmacy:schedule");
  });

  it("registerPharmacySector is idempotent (safe to call twice)", () => {
    const reg = createSectorRegistry();
    registerPharmacySector(reg);
    registerPharmacySector(reg);
    expect(reg.has("pharmacy")).toBe(true);
    expect(reg.all().filter((s) => s.id === "pharmacy")).toHaveLength(1);
  });

  describe("attributeSchema", () => {
    const schema = pharmacyModule.attributeSchema!;

    it("validates a { din } / { npn } / { scheduleOverride } object", () => {
      expect(schema.safeParse({ din: "00654523" }).success).toBe(true);
      expect(schema.safeParse({ npn: "80004939" }).success).toBe(true);
      expect(schema.safeParse({ scheduleOverride: "NARCOTIC" }).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(true);
    });

    it("rejects a bad shape (non-string din / invalid override enum)", () => {
      expect(schema.safeParse({ din: 12345 }).success).toBe(false);
      expect(schema.safeParse({ scheduleOverride: "BOGUS" }).success).toBe(false);
    });
  });
});
