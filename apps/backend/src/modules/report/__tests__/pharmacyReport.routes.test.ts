// Phase 2.5 — integration tests for the pharmacy report endpoints under
// /api/v1/reports/pharmacy. Exercises the real Express app with an in-memory
// tenant client (same approach as the 2.4 narcotic.routes suite). Focus: auth +
// REPORTS_SALES_READ gating on a read, and the CSV content-type on an export.
// The narcotic report only touches product / drugProduct / storeStock /
// stockMovement / narcoticEvent, all faked here.

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

interface ProductRow {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  din: string | null;
  scheduleOverride: string | null;
  isActive: boolean;
}

const { store, createTenantClientMock } = vi.hoisted(() => {
  const store = {
    drugs: [] as Array<{ din: string; scheduleCategory: string }>,
    products: [] as ProductRow[],
    stock: [] as Array<{ tenantId: string; storeId: string; productId: string; quantity: number }>,
    movements: [] as Array<{ tenantId: string; storeId: string; productId: string; type: string; quantityChange: number; createdAt: Date }>,
    events: [] as Array<{ tenantId: string; storeId: string; productId: string; eventType: string; quantityChange: number | null; discrepancy: number | null; createdAt: Date }>,
  };

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

  function makeClient(tenantId: string) {
    return {
      product: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.products
            .filter((p) => p.tenantId === tenantId)
            .filter((p) => (where.isActive === undefined ? true : p.isActive === where.isActive))
            .filter((p) => {
              const or = where.OR as Array<Record<string, unknown>> | undefined;
              if (!or) return true;
              return or.some((c) => ("din" in c ? p.din !== null : "scheduleOverride" in c ? p.scheduleOverride !== null : false));
            })
            .filter((p) => (where.id === undefined ? true : inSet(p.id, where.id)))
            .map((p) => ({ ...p })),
      },
      drugProduct: {
        findMany: async ({ where }: { where: { din: { in: string[] } } }) =>
          store.drugs.filter((d) => where.din.in.includes(d.din)).map((d) => ({ ...d })),
      },
      storeStock: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.stock
            .filter((s) => s.tenantId === tenantId)
            .filter((s) => (where.storeId === undefined ? true : s.storeId === where.storeId))
            .filter((s) => (where.productId === undefined ? true : inSet(s.productId, where.productId)))
            .map((s) => ({ ...s })),
      },
      stockMovement: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.movements
            .filter((m) => m.tenantId === tenantId)
            .filter((m) => (where.storeId === undefined ? true : m.storeId === where.storeId))
            .filter((m) => (where.productId === undefined ? true : inSet(m.productId, where.productId)))
            .filter((m) => (where.type === undefined ? true : inSet(m.type, where.type)))
            .filter((m) => dateRange(m.createdAt, where.createdAt))
            .map((m) => ({ ...m })),
      },
      narcoticEvent: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.events
            .filter((e) => e.tenantId === tenantId)
            .filter((e) => (where.storeId === undefined ? true : e.storeId === where.storeId))
            .filter((e) => (where.productId === undefined ? true : inSet(e.productId, where.productId)))
            .filter((e) => dateRange(e.createdAt, where.createdAt))
            .map((e) => ({ ...e })),
      },
    };
  }

  const createTenantClientMock = vi.fn((tenantId: string) => makeClient(tenantId));
  return { store, createTenantClientMock };
});

vi.mock("../../../config/database", () => ({
  prisma: {},
  createTenantClient: createTenantClientMock,
}));

import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";

const TENANT = "tenant-1";
const STORE = "11111111-1111-4111-8111-111111111111"; // reportQuerySchema requires a uuid storeId

function token(role = "ADMIN"): string {
  return signAccessToken({
    sub: "u-1",
    tenantId: TENANT,
    storeId: STORE,
    storeIds: [STORE],
    role,
    email: "u@test.io",
    firstName: "U",
    lastName: "T",
  } as never);
}

const RANGE = "dateFrom=2026-06-01&dateTo=2026-06-30";

beforeEach(() => {
  store.drugs = [{ din: "111", scheduleCategory: "NARCOTIC" }];
  store.products = [
    { id: "p-narc", tenantId: TENANT, name: "Codeine", sku: "COD", din: "111", scheduleOverride: null, isActive: true },
  ];
  store.stock = [{ tenantId: TENANT, storeId: STORE, productId: "p-narc", quantity: 50 }];
  store.movements = [
    { tenantId: TENANT, storeId: STORE, productId: "p-narc", type: "SALE", quantityChange: -5, createdAt: new Date("2026-06-15T10:00:00Z") },
  ];
  store.events = [];
});

describe("GET /api/v1/reports/pharmacy/narcotic", () => {
  it("401s without auth", async () => {
    const res = await supertest(app).get(`/api/v1/reports/pharmacy/narcotic?storeId=${STORE}&${RANGE}`);
    expect(res.status).toBe(401);
  });

  it("403s a role without REPORTS_SALES_READ (CASHIER)", async () => {
    const res = await supertest(app)
      .get(`/api/v1/reports/pharmacy/narcotic?storeId=${STORE}&${RANGE}`)
      .set("Authorization", `Bearer ${token("CASHIER")}`);
    expect(res.status).toBe(403);
  });

  it("returns the narcotic report for an authorized role", async () => {
    const res = await supertest(app)
      .get(`/api/v1/reports/pharmacy/narcotic?storeId=${STORE}&${RANGE}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toMatchObject({ productId: "p-narc", dispensed: 5, onHand: 50 });
  });
});

describe("GET /api/v1/reports/pharmacy/export/narcotic", () => {
  it("streams a CSV (text/csv content-type) to an export-permitted role", async () => {
    const res = await supertest(app)
      .get(`/api/v1/reports/pharmacy/export/narcotic?storeId=${STORE}&${RANGE}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("Dispensed");
  });
});
