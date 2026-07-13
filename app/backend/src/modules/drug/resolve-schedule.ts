// Phase 2.2 — Effective schedule resolution (schedule ENFORCEMENT input).
//
// 2.1 classified a drug's federal schedule into a `DrugScheduleCategory`; 2.2
// resolves the EFFECTIVE category for a cart line and feeds it to the pharmacy
// compliance hook. Precedence: a tenant's per-product `scheduleOverride` wins
// over the global DrugProduct catalog category, which wins over `OPEN`.

import { DrugScheduleCategory } from "@/generated/prisma/enums";

/**
 * Pure precedence rule: an explicit per-product override wins over the catalog
 * category, which wins over the safe default `OPEN`. (`OPEN` here is a
 * fail-OPEN classification default — enforcement is additive on top and only
 * ever blocks the restrictive categories.)
 */
export function effectiveSchedule(
  override: DrugScheduleCategory | null,
  catalogCategory: DrugScheduleCategory | null,
): DrugScheduleCategory {
  return override ?? catalogCategory ?? DrugScheduleCategory.OPEN;
}

// Minimal structural client surface the batch helper needs. `product` is
// tenant-scoped (per-tenant override); `drugProduct` is the GLOBAL catalog
// (queried by DIN, no tenant filter) — both satisfied by TenantPrismaClient.
interface ScheduleResolverClient {
  product: {
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; scheduleOverride: true };
    }): Promise<Array<{ id: string; scheduleOverride: DrugScheduleCategory | null }>>;
  };
  drugProduct: {
    findMany(args: {
      where: { din: { in: string[] } };
      select: { din: true; scheduleCategory: true };
    }): Promise<Array<{ din: string; scheduleCategory: DrugScheduleCategory }>>;
  };
}

/**
 * Batch-resolve each cart line's effective {@link DrugScheduleCategory}.
 *
 * For each line: the tenant Product's `scheduleOverride` (if any) wins over the
 * GLOBAL DrugProduct catalog category resolved by the line's DIN, else `OPEN`.
 * Two batched queries (products by id, drug products by din) — no per-line
 * round-trips. Returns a `Map<productId, category>`.
 */
export async function resolveCartSchedules(
  db: ScheduleResolverClient,
  lines: Array<{ productId: string; din: string | null }>,
): Promise<Map<string, DrugScheduleCategory>> {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const dins = [...new Set(lines.map((l) => l.din).filter((d): d is string => !!d))];

  const products =
    productIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, scheduleOverride: true },
        })
      : [];

  const drugs =
    dins.length > 0
      ? await db.drugProduct.findMany({
          where: { din: { in: dins } },
          select: { din: true, scheduleCategory: true },
        })
      : [];

  const overrideByProduct = new Map(products.map((p) => [p.id, p.scheduleOverride]));
  const categoryByDin = new Map(drugs.map((d) => [d.din, d.scheduleCategory]));

  const out = new Map<string, DrugScheduleCategory>();
  for (const line of lines) {
    const override = overrideByProduct.get(line.productId) ?? null;
    const catalogCategory = line.din ? categoryByDin.get(line.din) ?? null : null;
    out.set(line.productId, effectiveSchedule(override, catalogCategory));
  }
  return out;
}
