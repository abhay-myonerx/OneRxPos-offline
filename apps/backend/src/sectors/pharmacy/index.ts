import { z } from "zod";

import type { ComplianceResult, SectorModule } from "../core/types";
import { sectorRegistry, type SectorRegistry } from "../core/registry";
import { DrugScheduleCategory } from "@/generated/prisma/enums";

// Pharmacy sector (plugin #1, Phase 2). 2.1 stood up the drug-identity backbone
// and registered this sector's product-attribute contract only. 2.2 adds the
// schedule-ENFORCEMENT compliance hook + Rx-at-till: a prescription-only line
// cannot ring without a linked Rx, and a behind-counter line needs a pharmacist
// consult. A tenant opts in via `enabledSectors.pharmacy` (defaults OFF); when
// off, `resolveActiveSectors` excludes this module so the hook never runs.

// ── Pure per-line rule (fully unit-tested) ────────────────────────────────────
//
// The single source of truth for "may this line check out?". 2.2 treats
// NARCOTIC like NEEDS_RX (both require a linked Rx — the narcotic perpetual log
// is 2.4). BEHIND_COUNTER requires a pharmacist consult ack. Everything else
// (OPEN, or any unrecognized category) is allowed — enforcement is additive and
// only ever blocks the restrictive categories. SCHEDULE_OVERRIDE / Rx-bypass is
// deliberately NOT honored here (deferred): a NEEDS_RX line with no Rx is a HARD
// block in 2.2.
export interface LineAttributes {
  scheduleCategory: DrugScheduleCategory;
  rxLinked: boolean;
  consultAck: boolean;
}

export function evaluateLine(attrs: LineAttributes): ComplianceResult {
  const { scheduleCategory, rxLinked, consultAck } = attrs;

  if (
    (scheduleCategory === DrugScheduleCategory.NEEDS_RX ||
      scheduleCategory === DrugScheduleCategory.NARCOTIC) &&
    !rxLinked
  ) {
    return {
      allow: false,
      code: "RX_REQUIRED",
      reason: "This item requires a linked prescription.",
    };
  }

  if (scheduleCategory === DrugScheduleCategory.BEHIND_COUNTER && !consultAck) {
    return {
      allow: false,
      code: "CONSULT_REQUIRED",
      reason: "This item requires a pharmacist consult.",
    };
  }

  return { allow: true };
}

// Coerce a checkout item's opaque `attributes` bag into the typed rule input.
// Missing/unknown category → OPEN (allow); missing flags → false (fail-closed).
function readLineAttributes(attributes: Record<string, unknown> | undefined): LineAttributes {
  const a = attributes ?? {};
  const raw = a.scheduleCategory;
  const scheduleCategory =
    typeof raw === "string" && raw in DrugScheduleCategory
      ? (raw as DrugScheduleCategory)
      : DrugScheduleCategory.OPEN;
  return {
    scheduleCategory,
    rxLinked: a.rxLinked === true,
    consultAck: a.consultAck === true,
  };
}

export const pharmacyModule: SectorModule = {
  id: "pharmacy",
  label: "Pharmacy",
  attributeSchema: z.object({
    din: z.string().optional(),
    npn: z.string().optional(),
    scheduleOverride: z
      .enum([
        DrugScheduleCategory.NEEDS_RX,
        DrugScheduleCategory.NARCOTIC,
        DrugScheduleCategory.BEHIND_COUNTER,
        DrugScheduleCategory.OPEN,
      ])
      .optional(),
  }),
  complianceHooks: [
    {
      id: "pharmacy:schedule",
      evaluate(ctx) {
        // First deny wins — abort the sale on the first offending line.
        for (const item of ctx.items) {
          const result = evaluateLine(readLineAttributes(item.attributes));
          if (!result.allow) return result;
        }
        return { allow: true };
      },
    },
  ],
};

// Idempotent registration so importing the barrel twice (HMR / tests) is safe.
export function registerPharmacySector(registry: SectorRegistry = sectorRegistry): void {
  if (!registry.has(pharmacyModule.id)) registry.register(pharmacyModule);
}
