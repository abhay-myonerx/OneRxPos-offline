import { describe, it, expect } from "vitest";
import * as sectors from "../index";
import { sectorRegistry } from "../core/registry";

describe("sectors barrel", () => {
  it("re-exports the stable public API", () => {
    for (const name of [
      "createSectorRegistry",
      "resolveActiveSectors",
      "createCheckoutPipeline",
      "ComplianceBlockedError",
      "validateProductAttributes",
      "registerSampleSector",
    ]) {
      expect(typeof (sectors as Record<string, unknown>)[name]).toBe("function");
    }
    expect((sectors as Record<string, unknown>).sampleSector).toBeTruthy();
  });
  it("registers the sample sector into the default registry on import", () => {
    expect(sectorRegistry.has("sample")).toBe(true);
  });
});
