import { describe, it, expect } from "vitest";
import { createCheckoutPipeline } from "../pipeline";
import type { CheckoutContext, CheckoutStep, SectorModule } from "../types";

const ctx = (): CheckoutContext => ({ tenantId: "t", storeId: "s", items: [], scratch: {} });
const recStep = (id: string, phase: CheckoutStep["phase"], order?: number): CheckoutStep => ({
  id,
  phase,
  order,
  run(c) {
    (c.scratch.order ??= []) as string[];
    (c.scratch.order as string[]).push(id);
  },
});

describe("createCheckoutPipeline", () => {
  it("orders steps by phase then order, stable on insertion", () => {
    const core: CheckoutStep[] = [recStep("core-price", "price"), recStep("core-validate", "validate")];
    const sector: SectorModule = {
      id: "x",
      label: "x",
      checkoutSteps: [recStep("plugin-validate", "validate", 5), recStep("plugin-commit", "commit")],
    };
    const p = createCheckoutPipeline(core, [sector]);
    // validate(core order0) < validate(plugin order5) < price < commit
    expect(p.steps().map((s) => s.id)).toEqual([
      "core-validate",
      "plugin-validate",
      "core-price",
      "core:compliance",
      "plugin-commit",
    ]);
  });
  it("runs steps sequentially in composed order", async () => {
    const core = [recStep("a", "validate"), recStep("b", "commit")];
    const p = createCheckoutPipeline(core, []);
    const c = ctx();
    await p.run(c);
    expect(c.scratch.order).toEqual(["a", "b"]);
  });
  it("aborts the pipeline when a step throws", async () => {
    const boom: CheckoutStep = {
      id: "boom",
      phase: "validate",
      run() {
        throw new Error("boom");
      },
    };
    const after = recStep("after", "commit");
    const p = createCheckoutPipeline([boom, after], []);
    const c = ctx();
    await expect(p.run(c)).rejects.toThrow("boom");
    expect(c.scratch.order).toBeUndefined(); // "after" never ran
  });
});
