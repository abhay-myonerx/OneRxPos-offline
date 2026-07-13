// Phase 2.5 — Pharmacy Reports (read-only, PII-free).
//
// Three period-filtered reports built from data 2.1/2.2/2.4 already produce — no
// schema, no migration. All tenant-scoped through the injected `db` client.
//   1. getNarcoticReport   — per controlled drug: movement + event aggregation.
//   2. getRxSalesReport    — RxLink copay totals grouped by day.
//   3. getScheduleBreakdown — SaleItem quantity + revenue per effective schedule.

import { TenantPrismaClient } from "../../config/database";
import type { ReportQuery } from "./report.validation";
import { StockMovementType, DrugScheduleCategory } from "@/generated/prisma/enums";
import { listNarcoticProducts } from "../narcotic/narcotic-products";
import { resolveCartSchedules } from "../drug/resolve-schedule";

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface NarcoticReportRow {
  productId: string;
  name: string;
  din: string | null;
  dispensed: number;
  received: number;
  destroyed: number;
  lost: number;
  stolen: number;
  discrepancy: number;
  onHand: number;
}

/**
 * Per controlled drug over [dateFrom, dateTo]: dispensed (SALE, reported +qty
 * out), received (PURCHASE_IN), destroyed / lost / stolen (NarcoticEvent, +qty)
 * and net COUNT discrepancy, plus the current on-hand. Narcotic identity + on-hand
 * come from the 2.4 `listNarcoticProducts` (effective-schedule = NARCOTIC only);
 * non-narcotic products never appear. StockMovement / NarcoticEvent are filtered
 * by store only when `query.storeId` is given (else summed across stores, matching
 * the on-hand the helper returns for an unscoped call).
 */
export async function getNarcoticReport(
  db: TenantPrismaClient,
  query: ReportQuery,
): Promise<{ rows: NarcoticReportRow[] }> {
  const storeId = query.storeId;
  // listNarcoticProducts filters store_stock by storeId; an undefined storeId is
  // ignored by Prisma (on-hand summed across stores), which is the intended
  // behaviour for an unscoped report.
  const products = await listNarcoticProducts(db, storeId as string);
  if (products.length === 0) return { rows: [] };

  const productIds = products.map((p) => p.productId);
  const window = { gte: query.dateFrom, lte: query.dateTo };
  const storeFilter = storeId ? { storeId } : {};

  const movements = await db.stockMovement.findMany({
    where: {
      productId: { in: productIds },
      type: { in: [StockMovementType.SALE, StockMovementType.PURCHASE_IN] },
      createdAt: window,
      ...storeFilter,
    },
    select: { productId: true, type: true, quantityChange: true },
  });

  const events = await db.narcoticEvent.findMany({
    where: {
      productId: { in: productIds },
      createdAt: window,
      ...storeFilter,
    },
    select: { productId: true, eventType: true, quantityChange: true, discrepancy: true },
  });

  const rows = products.map((p) => {
    let dispensed = 0;
    let received = 0;
    let destroyed = 0;
    let lost = 0;
    let stolen = 0;
    let discrepancy = 0;

    for (const m of movements) {
      if (m.productId !== p.productId) continue;
      if (m.type === StockMovementType.SALE) dispensed += -m.quantityChange;
      else if (m.type === StockMovementType.PURCHASE_IN) received += m.quantityChange;
    }
    for (const e of events) {
      if (e.productId !== p.productId) continue;
      const qty = -(e.quantityChange ?? 0); // events store a negative quantity_change
      switch (e.eventType) {
        case "DESTRUCTION":
          destroyed += qty;
          break;
        case "LOSS":
          lost += qty;
          break;
        case "THEFT":
          stolen += qty;
          break;
        case "COUNT":
          discrepancy += e.discrepancy ?? 0;
          break;
      }
    }

    return {
      productId: p.productId,
      name: p.name,
      din: p.din,
      dispensed,
      received,
      destroyed,
      lost,
      stolen,
      discrepancy,
      onHand: p.onHand,
    };
  });

  return { rows };
}

export interface RxSalesDay {
  day: string; // YYYY-MM-DD
  rxCount: number;
  copayTotal: number;
}

/**
 * Rx sales from RxLink (no storeId of its own — store is filtered through the
 * joined Sale). Only COMPLETED sales in the window count. Grouped by calendar day
 * (UTC), copay Decimal → number, with grand totals.
 */
export async function getRxSalesReport(
  db: TenantPrismaClient,
  query: ReportQuery,
): Promise<{ byDay: RxSalesDay[]; totals: { rxCount: number; copayTotal: number } }> {
  const links = await db.rxLink.findMany({
    where: {
      sale: {
        createdAt: { gte: query.dateFrom, lte: query.dateTo },
        status: "COMPLETED",
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
    },
    select: { copay: true, sale: { select: { createdAt: true } } },
  });

  const map = new Map<string, { rxCount: number; copayTotal: number }>();
  for (const l of links) {
    const day = l.sale.createdAt.toISOString().slice(0, 10);
    const prev = map.get(day) ?? { rxCount: 0, copayTotal: 0 };
    map.set(day, {
      rxCount: prev.rxCount + 1,
      copayTotal: prev.copayTotal + Number(l.copay ?? 0),
    });
  }

  const byDay = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, v]) => ({ day, rxCount: v.rxCount, copayTotal: round2(v.copayTotal) }));

  const totals = byDay.reduce(
    (t, d) => ({ rxCount: t.rxCount + d.rxCount, copayTotal: t.copayTotal + d.copayTotal }),
    { rxCount: 0, copayTotal: 0 },
  );
  totals.copayTotal = round2(totals.copayTotal);

  return { byDay, totals };
}

export interface ScheduleRow {
  category: DrugScheduleCategory;
  quantity: number;
  revenue: number;
}

// Stable category order → stable CSV. All four are always emitted (zero rows too).
const SCHEDULE_ORDER: DrugScheduleCategory[] = [
  DrugScheduleCategory.NEEDS_RX,
  DrugScheduleCategory.NARCOTIC,
  DrugScheduleCategory.BEHIND_COUNTER,
  DrugScheduleCategory.OPEN,
];

/**
 * Schedule-category breakdown: COMPLETED SaleItems in the window, each product's
 * effective schedule resolved via the 2.2 `resolveCartSchedules` (per-product
 * override ?? global DrugProduct catalog ?? OPEN), aggregated to quantity +
 * revenue per category. Store filtered through the joined Sale.
 */
export async function getScheduleBreakdown(
  db: TenantPrismaClient,
  query: ReportQuery,
): Promise<{ rows: ScheduleRow[] }> {
  const items = await db.saleItem.findMany({
    where: {
      sale: {
        createdAt: { gte: query.dateFrom, lte: query.dateTo },
        status: "COMPLETED",
        ...(query.storeId ? { storeId: query.storeId } : {}),
      },
    },
    select: { productId: true, quantity: true, lineTotal: true },
  });

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products =
    productIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, din: true },
        })
      : [];

  const schedules = await resolveCartSchedules(
    db,
    products.map((p) => ({ productId: p.id, din: p.din ?? null })),
  );

  const agg = new Map<DrugScheduleCategory, { quantity: number; revenue: number }>();
  for (const cat of SCHEDULE_ORDER) agg.set(cat, { quantity: 0, revenue: 0 });

  for (const it of items) {
    const cat = schedules.get(it.productId) ?? DrugScheduleCategory.OPEN;
    const a = agg.get(cat)!;
    a.quantity += it.quantity;
    a.revenue += Number(it.lineTotal);
  }

  const rows = SCHEDULE_ORDER.map((category) => {
    const a = agg.get(category)!;
    return { category, quantity: a.quantity, revenue: round2(a.revenue) };
  });

  return { rows };
}
