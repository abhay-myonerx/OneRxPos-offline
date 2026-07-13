// Phase 2.4 — narcotic-product resolution.
//
// A product is "narcotic" when its EFFECTIVE schedule (2.2 precedence:
// `scheduleOverride ?? DrugProduct(din).scheduleCategory ?? OPEN`) is NARCOTIC.
// The global `DrugProduct` catalog (keyed by DIN) is queried directly — it is
// NOT tenant-scoped. Reuses the pure `effectiveSchedule` rule from 2.2.

import type { TenantPrismaClient } from "../../config/database";
import { DrugScheduleCategory } from "@/generated/prisma/enums";
import { effectiveSchedule } from "../drug/resolve-schedule";
import { ValidationError } from "../../shared/errors/ValidationError";

export interface NarcoticProductDto {
  productId: string;
  name: string;
  sku: string;
  din: string | null;
  onHand: number;
}

// Candidate products: those a tenant has flagged as drugs (a `din` soft-link) or
// given an explicit per-product `scheduleOverride`. Only these can resolve to a
// restrictive schedule, so this narrows the effective-schedule pass.
async function findCandidateProducts(db: TenantPrismaClient) {
  return db.product.findMany({
    where: {
      isActive: true,
      OR: [{ din: { not: null } }, { scheduleOverride: { not: null } }],
    },
    select: { id: true, name: true, sku: true, din: true, scheduleOverride: true },
  });
}

// Resolve each candidate's effective schedule. Overrides come from the tenant
// Product row itself; catalog categories are batch-resolved from the GLOBAL
// DrugProduct table by DIN.
async function resolveNarcoticIds(
  db: TenantPrismaClient,
  candidates: Array<{ id: string; din: string | null; scheduleOverride: DrugScheduleCategory | null }>,
): Promise<Set<string>> {
  const dins = [...new Set(candidates.map((c) => c.din).filter((d): d is string => !!d))];
  const drugs =
    dins.length > 0
      ? await db.drugProduct.findMany({
          where: { din: { in: dins } },
          select: { din: true, scheduleCategory: true },
        })
      : [];
  const categoryByDin = new Map(drugs.map((d) => [d.din, d.scheduleCategory]));

  const narcotic = new Set<string>();
  for (const c of candidates) {
    const catalog = c.din ? categoryByDin.get(c.din) ?? null : null;
    if (effectiveSchedule(c.scheduleOverride, catalog) === DrugScheduleCategory.NARCOTIC) {
      narcotic.add(c.id);
    }
  }
  return narcotic;
}

/**
 * List the tenant's NARCOTIC-scheduled products at a store, each with its
 * current on-hand (summed across all `store_stock` rows for that store/product).
 */
export async function listNarcoticProducts(
  db: TenantPrismaClient,
  storeId: string,
): Promise<NarcoticProductDto[]> {
  const candidates = await findCandidateProducts(db);
  const narcoticIds = await resolveNarcoticIds(db, candidates);

  const narcoticProducts = candidates.filter((c) => narcoticIds.has(c.id));
  if (narcoticProducts.length === 0) return [];

  const stockRows = await db.storeStock.findMany({
    where: { storeId, productId: { in: narcoticProducts.map((p) => p.id) } },
    select: { productId: true, quantity: true },
  });
  const onHandByProduct = new Map<string, number>();
  for (const s of stockRows) {
    onHandByProduct.set(s.productId, (onHandByProduct.get(s.productId) ?? 0) + s.quantity);
  }

  return narcoticProducts.map((p) => ({
    productId: p.id,
    name: p.name,
    sku: p.sku,
    din: p.din ?? null,
    onHand: onHandByProduct.get(p.id) ?? 0,
  }));
}

/**
 * Current on-hand for a single (store, product) — summed across variant rows.
 */
export async function getOnHand(
  db: TenantPrismaClient,
  storeId: string,
  productId: string,
): Promise<number> {
  const rows = await db.storeStock.findMany({
    where: { storeId, productId },
    select: { quantity: true },
  });
  return rows.reduce((sum, r) => sum + r.quantity, 0);
}

/**
 * Guard for the write endpoints: reject (400) a product whose effective schedule
 * is not NARCOTIC. Also 400s an unknown product (fail-closed for a narcotic path).
 */
export async function assertNarcotic(db: TenantPrismaClient, productId: string): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, din: true, scheduleOverride: true },
  });
  if (!product) {
    throw new ValidationError(`Product ${productId} not found`);
  }

  let catalog: DrugScheduleCategory | null = null;
  if (product.din) {
    const drug = await db.drugProduct.findUnique({
      where: { din: product.din },
      select: { scheduleCategory: true },
    });
    catalog = drug?.scheduleCategory ?? null;
  }

  if (effectiveSchedule(product.scheduleOverride, catalog) !== DrugScheduleCategory.NARCOTIC) {
    throw new ValidationError("Product is not a controlled substance (narcotic schedule)");
  }
}
