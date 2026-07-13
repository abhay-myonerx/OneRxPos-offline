// Phase 2.4 — controlled-substances / narcotic log service.
//
// The perpetual log is DERIVED: per-product movement history comes from the
// existing `StockMovement` ledger (running balance = `quantityAfter`), with
// `NarcoticEvent` COUNT rows interleaved for the reconciliation trail. Writes:
//   • count      — observation-only; snapshots on-hand, stores counted +
//                  discrepancy. Does NOT move stock.
//   • adjustment — loss/theft/destruction; reduces stock via an `ADJUSTMENT_SUB`
//                  StockMovement AND writes the NarcoticEvent, atomically in one
//                  `$transaction` (mirrors `inventory.service.adjustStock`).
//
// All access is through the request-scoped `TenantPrismaClient`, which injects
// `tenantId` on every read/create — a narcotic event, movement, or product from
// another tenant can never be read or written here.

import type { TenantPrismaClient } from "../../config/database";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import {
  assertNarcotic,
  getOnHand,
  listNarcoticProducts,
  type NarcoticProductDto,
} from "./narcotic-products";
import type { AdjustmentInput, CountInput, LogQuery } from "./narcotic.validation";

// ── DTOs (frontend contract) ──────────────────────────────────────────────────

export interface NarcoticEventDto {
  id: string;
  storeId: string;
  productId: string;
  shiftId: string | null;
  eventType: string;
  expectedQty: number;
  countedQty: number | null;
  quantityChange: number | null;
  discrepancy: number | null;
  reason: string | null;
  witnessUserId: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface MovementLogEntry {
  id: string;
  kind: "movement";
  productId: string;
  type: string;
  quantityChange: number;
  quantityAfter: number;
  referenceType: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface CountLogEntry {
  id: string;
  kind: "count";
  productId: string;
  expectedQty: number;
  countedQty: number | null;
  discrepancy: number | null;
  notes: string | null;
  createdAt: Date;
}

export type NarcoticLogEntry = MovementLogEntry | CountLogEntry;

interface EventRow {
  id: string;
  storeId: string;
  productId: string;
  shiftId: string | null;
  eventType: string;
  expectedQty: number;
  countedQty: number | null;
  quantityChange: number | null;
  discrepancy: number | null;
  reason: string | null;
  witnessUserId: string | null;
  notes: string | null;
  createdAt: Date;
}

function toEventDto(r: EventRow): NarcoticEventDto {
  return {
    id: r.id,
    storeId: r.storeId,
    productId: r.productId,
    shiftId: r.shiftId ?? null,
    eventType: r.eventType,
    expectedQty: r.expectedQty,
    countedQty: r.countedQty ?? null,
    quantityChange: r.quantityChange ?? null,
    discrepancy: r.discrepancy ?? null,
    reason: r.reason ?? null,
    witnessUserId: r.witnessUserId ?? null,
    notes: r.notes ?? null,
    createdAt: r.createdAt,
  };
}

// ── Products (narcotic set + on-hand) ─────────────────────────────────────────

export async function getProducts(
  db: TenantPrismaClient,
  storeId: string,
): Promise<NarcoticProductDto[]> {
  return listNarcoticProducts(db, storeId);
}

// ── Perpetual log (StockMovement history + COUNT reconciliation trail) ────────

export async function getLog(db: TenantPrismaClient, query: LogQuery): Promise<NarcoticLogEntry[]> {
  const narcoticProducts = await listNarcoticProducts(db, query.storeId);
  let productIds = narcoticProducts.map((p) => p.productId);

  // A specific product filter narrows to that product — but only if it is one of
  // the narcotic products (a non-narcotic product yields an empty log).
  if (query.productId) {
    productIds = productIds.filter((id) => id === query.productId);
  }
  if (productIds.length === 0) return [];

  const createdAt: Record<string, Date> = {};
  if (query.from) createdAt.gte = query.from;
  if (query.to) createdAt.lte = query.to;
  const createdAtFilter = Object.keys(createdAt).length > 0 ? { createdAt } : {};

  const movements = await db.stockMovement.findMany({
    where: { storeId: query.storeId, productId: { in: productIds }, ...createdAtFilter },
    select: {
      id: true,
      productId: true,
      type: true,
      quantityChange: true,
      quantityAfter: true,
      referenceType: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const counts = await db.narcoticEvent.findMany({
    where: {
      storeId: query.storeId,
      productId: { in: productIds },
      eventType: "COUNT",
      ...createdAtFilter,
    },
    select: {
      id: true,
      productId: true,
      expectedQty: true,
      countedQty: true,
      discrepancy: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const movementEntries: NarcoticLogEntry[] = movements.map((m) => ({
    id: m.id,
    kind: "movement",
    productId: m.productId,
    type: String(m.type),
    quantityChange: m.quantityChange,
    quantityAfter: m.quantityAfter,
    referenceType: m.referenceType ?? null,
    notes: m.notes ?? null,
    createdAt: m.createdAt,
  }));

  const countEntries: NarcoticLogEntry[] = counts.map((c) => ({
    id: c.id,
    kind: "count",
    productId: c.productId,
    expectedQty: c.expectedQty,
    countedQty: c.countedQty ?? null,
    discrepancy: c.discrepancy ?? null,
    notes: c.notes ?? null,
    createdAt: c.createdAt,
  }));

  // Interleave newest-first.
  return [...movementEntries, ...countEntries].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

// ── Physical count (observation-only) ─────────────────────────────────────────

export async function recordCount(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: CountInput,
): Promise<NarcoticEventDto> {
  await assertNarcotic(db, input.productId);

  const expectedQty = await getOnHand(db, input.storeId, input.productId);
  const discrepancy = input.countedQty - expectedQty;

  const row = await db.narcoticEvent.create({
    // `tenantId` passed explicitly to satisfy the create type; the tenant-scope
    // extension re-injects the same tenantId at runtime.
    data: {
      tenantId,
      storeId: input.storeId,
      productId: input.productId,
      shiftId: input.shiftId ?? null,
      eventType: "COUNT",
      expectedQty,
      countedQty: input.countedQty,
      discrepancy,
      witnessUserId: input.witnessUserId ?? null,
      createdByUserId: userId,
      notes: input.notes ?? null,
    },
  });

  logger.info(
    { tenantId, storeId: input.storeId, productId: input.productId, expectedQty, discrepancy },
    "Narcotic count recorded",
  );

  return toEventDto(row as EventRow);
}

// ── Loss / theft / destruction (stock-reducing) ───────────────────────────────

export async function recordAdjustment(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: AdjustmentInput,
): Promise<NarcoticEventDto> {
  await assertNarcotic(db, input.productId);

  // The event + the ADJUSTMENT_SUB StockMovement + the store_stock reduction all
  // commit atomically — mirrors `inventory.service.adjustStock`'s transaction so
  // the log and on-hand can never diverge.
  const event = await db.$transaction(async (tx) => {
    const existing = await tx.storeStock.findFirst({
      where: { storeId: input.storeId, productId: input.productId, variantId: null },
      select: { id: true, quantity: true },
    });
    const currentQty = existing?.quantity ?? 0;
    const newQty = currentQty - input.quantity;

    // Cannot destroy/lose more than is on-hand — a controlled substance must not
    // go negative (fail-closed, mirrors adjustStock's ADJUSTMENT_SUB guard).
    if (newQty < 0) {
      throw new ValidationError(
        `Adjustment would result in negative stock (current: ${currentQty}, remove: ${input.quantity}).`,
      );
    }

    if (existing) {
      await tx.storeStock.update({ where: { id: existing.id }, data: { quantity: newQty } });
    } else {
      // No stock row yet with a positive quantity to remove — guard above already
      // rejects this, but create a zeroed row for consistency if ever reached.
      await tx.storeStock.create({
        data: { storeId: input.storeId, productId: input.productId, variantId: null, quantity: newQty },
      });
    }

    const created = await tx.narcoticEvent.create({
      data: {
        tenantId,
        storeId: input.storeId,
        productId: input.productId,
        eventType: input.eventType,
        expectedQty: currentQty,
        quantityChange: -input.quantity,
        reason: input.eventType,
        witnessUserId: input.witnessUserId ?? null,
        createdByUserId: userId,
        notes: input.notes ?? null,
      },
    });

    await tx.stockMovement.create({
      data: {
        tenantId,
        storeId: input.storeId,
        productId: input.productId,
        variantId: null,
        type: "ADJUSTMENT_SUB",
        quantityChange: -input.quantity,
        quantityAfter: newQty,
        referenceType: `NARCOTIC_${input.eventType}`,
        referenceId: created.id,
        notes: input.notes ?? input.eventType,
        performedBy: userId,
      },
    });

    return created;
  });

  logger.info(
    {
      tenantId,
      storeId: input.storeId,
      productId: input.productId,
      eventType: input.eventType,
      quantity: input.quantity,
    },
    "Narcotic adjustment recorded",
  );

  return toEventDto(event as EventRow);
}
