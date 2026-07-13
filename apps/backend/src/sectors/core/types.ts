import type { ZodTypeAny } from "zod";

export type CheckoutPhase = "validate" | "price" | "compliance" | "commit" | "post-commit";

export interface CheckoutContext {
  tenantId: string;
  storeId: string;
  // Minimal cart shape for the skeleton; real checkout enriches this in Phase 1.
  items: Array<{ productId: string; quantity: number; attributes?: Record<string, unknown> }>;
  // Scratch space steps read/write to pass data down the pipeline.
  scratch: Record<string, unknown>;
}

export interface CheckoutStep {
  id: string;
  phase: CheckoutPhase;
  order?: number; // within-phase tiebreak; default 0
  run(ctx: CheckoutContext): void | Promise<void>; // mutate ctx or throw to abort
}

export interface ComplianceResult {
  allow: boolean;
  reason?: string;
  code?: string;
}

export interface ComplianceHook {
  id: string;
  evaluate(ctx: CheckoutContext): ComplianceResult | Promise<ComplianceResult>;
}

export interface SectorModule {
  id: string; // sector slug, e.g. "sample", "pharmacy"
  label: string;
  checkoutSteps?: CheckoutStep[];
  complianceHooks?: ComplianceHook[];
  attributeSchema?: ZodTypeAny; // this sector's product-attribute contract
}
