// Public sector-plugin core surface consumed by real sectors (Phase 2 pharmacy).
export type {
  CheckoutPhase,
  CheckoutContext,
  CheckoutStep,
  ComplianceResult,
  ComplianceHook,
  SectorModule,
} from "./types";

export { createSectorRegistry, sectorRegistry } from "./registry";
export type { SectorRegistry } from "./registry";

export { resolveActiveSectors } from "./resolve";

export { createCheckoutPipeline, ComplianceBlockedError } from "./pipeline";
export type { CheckoutPipeline } from "./pipeline";

export { validateProductAttributes } from "./attributes";
