import type { CheckoutStep, CheckoutContext, SectorModule, CheckoutPhase } from "./types";
import { AppError } from "@/shared/errors";

export class ComplianceBlockedError extends AppError {
  constructor(reason: string, code = "COMPLIANCE_BLOCKED") {
    super(403, code, reason);
    this.name = "ComplianceBlockedError";
  }
}

// Built-in step: runs every active sector's compliance hooks in order and aborts
// on the first denial. Injected into every pipeline at the `compliance` phase.
function complianceStep(activeSectors: SectorModule[]): CheckoutStep {
  const hooks = activeSectors.flatMap((s) => s.complianceHooks ?? []);
  return {
    id: "core:compliance",
    phase: "compliance",
    order: 0,
    async run(ctx) {
      for (const h of hooks) {
        const result = await h.evaluate(ctx);
        if (!result.allow) {
          throw new ComplianceBlockedError(result.reason ?? "Blocked by compliance", result.code);
        }
      }
    },
  };
}

const PHASE_ORDER: readonly CheckoutPhase[] = [
  "validate",
  "price",
  "compliance",
  "commit",
  "post-commit",
];

export interface CheckoutPipeline {
  run(ctx: CheckoutContext): Promise<void>;
  steps(): CheckoutStep[];
}

// Compose core + active sectors' checkout steps, ordered by (phase, order) with a
// stable tiebreak on insertion order (core before plugin at equal phase/order).
export function createCheckoutPipeline(
  coreSteps: CheckoutStep[],
  activeSectors: SectorModule[],
): CheckoutPipeline {
  const pluginSteps = activeSectors.flatMap((s) => s.checkoutSteps ?? []);
  const all = [...coreSteps, ...pluginSteps, complianceStep(activeSectors)];

  const ordered = all
    .map((step, i) => ({ step, i }))
    .sort((a, b) => {
      const pd = PHASE_ORDER.indexOf(a.step.phase) - PHASE_ORDER.indexOf(b.step.phase);
      if (pd !== 0) return pd;
      const od = (a.step.order ?? 0) - (b.step.order ?? 0);
      if (od !== 0) return od;
      return a.i - b.i; // stable: preserve insertion order on ties
    })
    .map((x) => x.step);

  return {
    steps: () => [...ordered],
    async run(ctx) {
      for (const step of ordered) {
        await step.run(ctx);
      }
    },
  };
}
