import { describe, it, expect } from "vitest";
import { createCheckoutPipeline, ComplianceBlockedError } from "../pipeline";
import type { CheckoutContext, ComplianceHook, SectorModule } from "../types";

const ctx = (): CheckoutContext => ({ tenantId: "t", storeId: "s", items: [], scratch: {} });
const hook = (id: string, result: () => { allow: boolean; reason?: string; code?: string }): ComplianceHook => ({
  id,
  evaluate: () => result(),
});
const sector = (id: string, hooks: ComplianceHook[]): SectorModule => ({ id, label: id, complianceHooks: hooks });

describe("compliance enforcement", () => {
  it("passes when all hooks allow", async () => {
    const s = sector("x", [hook("h1", () => ({ allow: true }))]);
    await expect(createCheckoutPipeline([], [s]).run(ctx())).resolves.toBeUndefined();
  });
  it("throws ComplianceBlockedError with reason + code on denial", async () => {
    const s = sector("x", [hook("h1", () => ({ allow: false, reason: "no sale", code: "NOPE" }))]);
    await expect(createCheckoutPipeline([], [s]).run(ctx())).rejects.toMatchObject({
      name: "ComplianceBlockedError",
      statusCode: 403,
      code: "NOPE",
      message: "no sale",
    });
  });
  it("first denial wins across multiple hooks", async () => {
    const s = sector("x", [
      hook("h1", () => ({ allow: true })),
      hook("h2", () => ({ allow: false, reason: "second blocks" })),
    ]);
    await expect(createCheckoutPipeline([], [s]).run(ctx())).rejects.toThrow("second blocks");
  });
  it("uses default code when the hook omits one", async () => {
    const s = sector("x", [hook("h1", () => ({ allow: false, reason: "blocked" }))]);
    await expect(createCheckoutPipeline([], [s]).run(ctx())).rejects.toMatchObject({
      code: "COMPLIANCE_BLOCKED",
    });
  });
});
