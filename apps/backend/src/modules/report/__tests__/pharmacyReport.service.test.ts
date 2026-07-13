// Phase 2.5 — unit tests for the pharmacy-report service against a tiny in-memory
// client (mirrors the 2.4 narcotic.service harness). Covers:
//   (a) narcotic report aggregates dispensed/received/destroyed/lost/stolen +
//       COUNT discrepancy per drug, and EXCLUDES non-narcotic products;
//   (b) rx-sales groups copay totals by day and sums grand totals;
//   (c) schedule breakdown buckets quantity + revenue by resolved category;
//   (d) window filtering — a movement / sale outside [from,to] is excluded.

import { describe, it, expect } from "vitest";
import {
  getNarcoticReport,
  getRxSalesReport,
  getScheduleBreakdown,
} from "../pharmacyReport.service";
import type { ReportQuery } from "../report.validation";
import type { TenantPrismaClient } from "../../../config/database";

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  din: string | null;
  scheduleOverride: string | null;
  isActive: boolean;
}
interface DrugRow {
  din: string;
  scheduleCategory: string;
}
interface StockRow {
  storeId: string;
  productId: string;
  quantity: number;
}
interface MovementRow {
  storeId: string;
  productId: string;
  type: string;
  quantityChange: number;
  createdAt: Date;
}
interface EventRow {
  storeId: string;
  productId: string;
  eventType: string;
  quantityChange: number | null;
  discrepancy: number | null;
  createdAt: Date;
}
interface RxLinkRow {
  copay: number | null;
  sale: { createdAt: Date; status: string; storeId: string };
}
interface SaleItemRow {
  productId: string;
  quantity: number;
  lineTotal: number;
  sale: { createdAt: Date; status: string; storeId: string };
}

interface Seed {
  products: ProductRow[];
  drugs: DrugRow[];
  stock: StockRow[];
  movements: MovementRow[];
  events: EventRow[];
  rxLinks: RxLinkRow[];
  saleItems: SaleItemRow[];
}

function inSet(val: unknown, where: unknown): boolean {
  const w = where as { in?: string[] } | undefined;
  if (w && typeof w === "object" && Array.isArray(w.in)) return w.in.includes(val as string);
  return val === where;
}
function dateRange(val: Date, where: unknown): boolean {
  const w = where as { gte?: Date; lte?: Date } | undefined;
  if (!w) return true;
  if (w.gte && val.getTime() < w.gte.getTime()) return false;
  if (w.lte && val.getTime() > w.lte.getTime()) return false;
  return true;
}
function saleMatch(sale: { createdAt: Date; status: string; storeId: string }, where: Record<string, unknown>): boolean {
  const s = where.sale as Record<string, unknown> | undefined;
  if (!s) return true;
  if (!dateRange(sale.createdAt, s.createdAt)) return false;
  if (s.status !== undefined && sale.status !== s.status) return false;
  if (s.storeId !== undefined && sale.storeId !== s.storeId) return false;
  return true;
}

function fakeDb(seed: Seed): TenantPrismaClient {
  return {
    product: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.products
          .filter((p) => (where.isActive === undefined ? true : p.isActive === where.isActive))
          .filter((p) => {
            const or = where.OR as Array<Record<string, unknown>> | undefined;
            if (!or) return true;
            return or.some((cond) => {
              if ("din" in cond) return p.din !== null;
              if ("scheduleOverride" in cond) return p.scheduleOverride !== null;
              return false;
            });
          })
          .filter((p) => (where.id === undefined ? true : inSet(p.id, where.id)))
          .map((p) => ({ ...p })),
    },
    drugProduct: {
      findMany: async ({ where }: { where: { din: { in: string[] } } }) =>
        seed.drugs.filter((d) => where.din.in.includes(d.din)).map((d) => ({ ...d })),
    },
    storeStock: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.stock
          .filter((s) => (where.storeId === undefined ? true : s.storeId === where.storeId))
          .filter((s) => (where.productId === undefined ? true : inSet(s.productId, where.productId)))
          .map((s) => ({ ...s })),
    },
    stockMovement: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.movements
          .filter((m) => (where.storeId === undefined ? true : m.storeId === where.storeId))
          .filter((m) => (where.productId === undefined ? true : inSet(m.productId, where.productId)))
          .filter((m) => (where.type === undefined ? true : inSet(m.type, where.type)))
          .filter((m) => dateRange(m.createdAt, where.createdAt))
          .map((m) => ({ ...m })),
    },
    narcoticEvent: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.events
          .filter((e) => (where.storeId === undefined ? true : e.storeId === where.storeId))
          .filter((e) => (where.productId === undefined ? true : inSet(e.productId, where.productId)))
          .filter((e) => dateRange(e.createdAt, where.createdAt))
          .map((e) => ({ ...e })),
    },
    rxLink: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.rxLinks.filter((r) => saleMatch(r.sale, where)).map((r) => ({ ...r })),
    },
    saleItem: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        seed.saleItems.filter((i) => saleMatch(i.sale, where)).map((i) => ({ ...i })),
    },
  } as unknown as TenantPrismaClient;
}

const FROM = new Date("2026-06-01T00:00:00.000Z");
const TO = new Date("2026-06-30T23:59:59.999Z");
const query = (over: Partial<ReportQuery> = {}): ReportQuery =>
  ({ dateFrom: FROM, dateTo: TO, groupBy: "day", ...over }) as ReportQuery;

const inWindow = new Date("2026-06-15T12:00:00.000Z");
const before = new Date("2026-05-15T12:00:00.000Z"); // outside window

const BASE: Seed = {
  products: [
    { id: "p-narc", name: "Codeine", sku: "COD", din: "111", scheduleOverride: null, isActive: true },
    { id: "p-narc2", name: "Morphine", sku: "MOR", din: null, scheduleOverride: "NARCOTIC", isActive: true },
    { id: "p-rx", name: "Statin", sku: "STA", din: "222", scheduleOverride: null, isActive: true },
    { id: "p-otc", name: "Advil", sku: "ADV", din: null, scheduleOverride: null, isActive: true },
  ],
  drugs: [
    { din: "111", scheduleCategory: "NARCOTIC" },
    { din: "222", scheduleCategory: "NEEDS_RX" },
  ],
  stock: [
    { storeId: "s1", productId: "p-narc", quantity: 50 },
    { storeId: "s1", productId: "p-narc2", quantity: 20 },
  ],
  movements: [],
  events: [],
  rxLinks: [],
  saleItems: [],
};

describe("getNarcoticReport", () => {
  it("aggregates dispensed/received/destroyed/discrepancy per drug; excludes non-narcotic", async () => {
    const db = fakeDb({
      ...BASE,
      movements: [
        { storeId: "s1", productId: "p-narc", type: "SALE", quantityChange: -5, createdAt: inWindow },
        { storeId: "s1", productId: "p-narc", type: "SALE", quantityChange: -3, createdAt: inWindow },
        { storeId: "s1", productId: "p-narc", type: "PURCHASE_IN", quantityChange: 20, createdAt: inWindow },
        // non-narcotic product movements must never surface
        { storeId: "s1", productId: "p-rx", type: "SALE", quantityChange: -99, createdAt: inWindow },
      ],
      events: [
        { storeId: "s1", productId: "p-narc", eventType: "DESTRUCTION", quantityChange: -4, discrepancy: null, createdAt: inWindow },
        { storeId: "s1", productId: "p-narc", eventType: "LOSS", quantityChange: -2, discrepancy: null, createdAt: inWindow },
        { storeId: "s1", productId: "p-narc", eventType: "THEFT", quantityChange: -1, discrepancy: null, createdAt: inWindow },
        { storeId: "s1", productId: "p-narc", eventType: "COUNT", quantityChange: null, discrepancy: -6, createdAt: inWindow },
      ],
    });

    const { rows } = await getNarcoticReport(db, query({ storeId: "s1" }));

    const ids = rows.map((r) => r.productId).sort();
    expect(ids).toEqual(["p-narc", "p-narc2"]);
    expect(rows.some((r) => r.productId === "p-rx" || r.productId === "p-otc")).toBe(false);

    const narc = rows.find((r) => r.productId === "p-narc")!;
    expect(narc).toMatchObject({
      dispensed: 8, // 5 + 3
      received: 20,
      destroyed: 4,
      lost: 2,
      stolen: 1,
      discrepancy: -6,
      onHand: 50,
    });

    const morphine = rows.find((r) => r.productId === "p-narc2")!;
    expect(morphine).toMatchObject({ dispensed: 0, received: 0, onHand: 20 });
  });

  it("excludes movements outside the date window", async () => {
    const db = fakeDb({
      ...BASE,
      movements: [
        { storeId: "s1", productId: "p-narc", type: "SALE", quantityChange: -5, createdAt: inWindow },
        { storeId: "s1", productId: "p-narc", type: "SALE", quantityChange: -100, createdAt: before },
      ],
    });
    const { rows } = await getNarcoticReport(db, query({ storeId: "s1" }));
    expect(rows.find((r) => r.productId === "p-narc")!.dispensed).toBe(5);
  });
});

describe("getRxSalesReport", () => {
  it("groups copay totals by day and sums grand totals; COMPLETED + window only", async () => {
    const db = fakeDb({
      ...BASE,
      rxLinks: [
        { copay: 10, sale: { createdAt: new Date("2026-06-10T09:00:00Z"), status: "COMPLETED", storeId: "s1" } },
        { copay: 5.5, sale: { createdAt: new Date("2026-06-10T18:00:00Z"), status: "COMPLETED", storeId: "s1" } },
        { copay: 20, sale: { createdAt: new Date("2026-06-11T10:00:00Z"), status: "COMPLETED", storeId: "s1" } },
        // excluded: non-completed
        { copay: 999, sale: { createdAt: new Date("2026-06-12T10:00:00Z"), status: "VOID", storeId: "s1" } },
        // excluded: outside window
        { copay: 999, sale: { createdAt: before, status: "COMPLETED", storeId: "s1" } },
      ],
    });

    const { byDay, totals } = await getRxSalesReport(db, query());

    expect(byDay).toEqual([
      { day: "2026-06-10", rxCount: 2, copayTotal: 15.5 },
      { day: "2026-06-11", rxCount: 1, copayTotal: 20 },
    ]);
    expect(totals).toEqual({ rxCount: 3, copayTotal: 35.5 });
  });

  it("filters by store when storeId is given", async () => {
    const db = fakeDb({
      ...BASE,
      rxLinks: [
        { copay: 10, sale: { createdAt: inWindow, status: "COMPLETED", storeId: "s1" } },
        { copay: 50, sale: { createdAt: inWindow, status: "COMPLETED", storeId: "s2" } },
      ],
    });
    const { totals } = await getRxSalesReport(db, query({ storeId: "s1" }));
    expect(totals).toEqual({ rxCount: 1, copayTotal: 10 });
  });
});

describe("getScheduleBreakdown", () => {
  it("buckets quantity + revenue by resolved effective schedule (all four categories)", async () => {
    const db = fakeDb({
      ...BASE,
      saleItems: [
        { productId: "p-narc", quantity: 2, lineTotal: 40, sale: { createdAt: inWindow, status: "COMPLETED", storeId: "s1" } },
        { productId: "p-narc2", quantity: 1, lineTotal: 30, sale: { createdAt: inWindow, status: "COMPLETED", storeId: "s1" } },
        { productId: "p-rx", quantity: 3, lineTotal: 60, sale: { createdAt: inWindow, status: "COMPLETED", storeId: "s1" } },
        { productId: "p-otc", quantity: 5, lineTotal: 25, sale: { createdAt: inWindow, status: "COMPLETED", storeId: "s1" } },
        // excluded: outside window
        { productId: "p-otc", quantity: 99, lineTotal: 999, sale: { createdAt: before, status: "COMPLETED", storeId: "s1" } },
      ],
    });

    const { rows } = await getScheduleBreakdown(db, query());

    const byCat = Object.fromEntries(rows.map((r) => [r.category, r]));
    expect(rows.map((r) => r.category)).toEqual(["NEEDS_RX", "NARCOTIC", "BEHIND_COUNTER", "OPEN"]);
    expect(byCat.NARCOTIC).toMatchObject({ quantity: 3, revenue: 70 }); // p-narc + p-narc2
    expect(byCat.NEEDS_RX).toMatchObject({ quantity: 3, revenue: 60 });
    expect(byCat.OPEN).toMatchObject({ quantity: 5, revenue: 25 });
    expect(byCat.BEHIND_COUNTER).toMatchObject({ quantity: 0, revenue: 0 });
  });
});
