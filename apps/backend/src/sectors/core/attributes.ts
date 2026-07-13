import { ValidationError } from "@/shared/errors";
import type { SectorModule } from "./types";

// Validate a product's attribute blob against every active sector that declares a
// schema. Each sector's schema is applied independently and its parsed (coerced)
// result merged over the input, so one sector's schema never drops another's keys.
// Sectors without a schema impose no constraint. Storage of attributes (a JSONB
// column) is deferred to Phase 2 — this is the contract + validator only.
export function validateProductAttributes(
  activeSectors: SectorModule[],
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  let out: Record<string, unknown> = { ...attributes };
  for (const sector of activeSectors) {
    if (!sector.attributeSchema) continue;
    const parsed = sector.attributeSchema.safeParse(attributes);
    if (!parsed.success) {
      throw new ValidationError(
        `Invalid product attributes for sector "${sector.id}"`,
        parsed.error.issues,
      );
    }
    out = { ...out, ...(parsed.data as Record<string, unknown>) };
  }
  return out;
}
