import { z } from "zod";
import type { SectorModule } from "../core/types";
import { sectorRegistry, type SectorRegistry } from "../core/registry";

// Dummy sector that exercises the core machine end-to-end. Not a real sector —
// pharmacy (plugin #1) lands in Phase 2. Kept so the skeleton has something to
// register, enable, run a step for, block on, and validate attributes against.
export const sampleSector: SectorModule = {
  id: "sample",
  label: "Sample Sector",
  checkoutSteps: [
    {
      id: "sample:mark",
      phase: "validate",
      order: 0,
      run(ctx) {
        ctx.scratch.sampleRan = true;
      },
    },
  ],
  complianceHooks: [
    {
      id: "sample:block-switch",
      evaluate(ctx) {
        if (ctx.scratch.sampleBlock === true) {
          return { allow: false, reason: "Sample sector blocked the sale", code: "SAMPLE_BLOCK" };
        }
        return { allow: true };
      },
    },
  ],
  attributeSchema: z.object({ sampleFlag: z.boolean().optional() }),
};

// Idempotent registration so importing the barrel twice (HMR / tests) is safe.
export function registerSampleSector(registry: SectorRegistry = sectorRegistry): void {
  if (!registry.has(sampleSector.id)) registry.register(sampleSector);
}
