import { describe, it, expect } from "vitest";
import { createSectorRegistry } from "../../core/registry";
import { resolveActiveSectors } from "../../core/resolve";
import { createCheckoutPipeline, ComplianceBlockedError } from "../../core/pipeline";
import { validateProductAttributes } from "../../core/attributes";
import type { CheckoutContext } from "../../core/types";
import { sampleSector, registerSampleSector } from "../index";

const ctx = (over: Partial<CheckoutContext> = {}): CheckoutContext => ({
  tenantId: "t",
  storeId: "s",
  items: [],
  scratch: {},
  ...over,
});

function registryWithSample() {
  const r = createSectorRegistry();
  registerSampleSector(r);
  return r;
}

describe("sample sector integration", () => {
  it("enabling 'sample' adds its checkout step; disabling removes it (0.7.1)", () => {
    const r = registryWithSample();
    const enabled = resolveActiveSectors(r, { sample: true });
    const disabled = resolveActiveSectors(r, { sample: false });
    expect(createCheckoutPipeline([], enabled).steps().map((s) => s.id)).toContain("sample:mark");
    expect(createCheckoutPipeline([], disabled).steps().map((s) => s.id)).not.toContain("sample:mark");
  });
  it("its checkout step runs and marks the context", async () => {
    const r = registryWithSample();
    const c = ctx();
    await createCheckoutPipeline([], resolveActiveSectors(r, { sample: true })).run(c);
    expect(c.scratch.sampleRan).toBe(true);
  });
  it("its compliance hook blocks when flipped (0.7.3)", async () => {
    const r = registryWithSample();
    const active = resolveActiveSectors(r, { sample: true });
    await expect(createCheckoutPipeline([], active).run(ctx({ scratch: { sampleBlock: true } }))).rejects.toBeInstanceOf(
      ComplianceBlockedError,
    );
  });
  it("its attribute schema validates (0.7.3)", () => {
    expect(validateProductAttributes([sampleSector], { sampleFlag: true })).toMatchObject({ sampleFlag: true });
    expect(() => validateProductAttributes([sampleSector], { sampleFlag: 1 })).toThrow(/sample/);
  });
  it("registerSampleSector is idempotent", () => {
    const r = createSectorRegistry();
    registerSampleSector(r);
    expect(() => registerSampleSector(r)).not.toThrow();
    expect(r.all().filter((m) => m.id === "sample")).toHaveLength(1);
  });
});
