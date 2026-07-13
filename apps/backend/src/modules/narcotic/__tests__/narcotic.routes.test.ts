// Integration tests for the Phase 2.4 narcotic-log endpoints under
// /api/v1/narcotic — exercises the real Express app (imported directly; `app.ts`
// never calls `app.listen`). As with the drug / cashier-shift suites there is no
// live test-DB, so `../../../config/database` is mocked:
//   • `prisma` — unused here beyond shape (the tenant client owns `$transaction`).
//   • `createTenantClient` — a small in-memory fake that filters tenant-scoped
//     models by the JWT's tenantId (product, storeStock, stockMovement,
//     narcoticEvent) and serves the GLOBAL drugProduct catalog unscoped, so the
//     narcotic-only filter + atomic stock reduction are exercised end-to-end.
//
// Coverage: (a) narcotic-only product filter (non-narcotic excluded); (b) count
// stores expected/counted/discrepancy and does NOT move stock; (c) destruction
// reduces store_stock, writes an ADJUSTMENT_SUB StockMovement + NarcoticEvent
// atomically and the log reflects the reduced quantityAfter; (d) a non-narcotic
// product is rejected on write (400); (e) INVENTORY_WRITE gating (a read-only
// role → 403 on write).

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

interface DrugRow {
  din: string;
  scheduleCategory: string;
}
interface ProductRow {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  din: string | null;
  scheduleOverride: string | null;
  isActive: boolean;
}
interface StockRow {
  id: string;
  tenantId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
}
interface MovementRow {
  id: string;
  tenantId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  type: string;
  quantityChange: number;
  quantityAfter: number;
  referenceId: string | null;
  referenceType: string | null;
  notes: string | null;
  performedBy: string;
  createdAt: Date;
}
interface EventRow {
  id: string;
  tenantId: string;
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
  createdByUserId: string;
  notes: string | null;
  createdAt: Date;
}

const { store, createTenantClientMock } = vi.hoisted(() => {
  const store = {
    drugs: [] as DrugRow[],
    products: [] as ProductRow[],
    stock: [] as StockRow[],
    movements: [] as MovementRow[],
    events: [] as EventRow[],
    seq: 0,
  };

  // `in` filter helper.
  function inSet(val: unknown, where: unknown): boolean {
    const w = where as { in?: string[]; not?: unknown } | undefined;
    if (w && typeof w === "object" && "in" in w && Array.isArray(w.in)) {
      return w.in.includes(val as string);
    }
    if (w && typeof w === "object" && "not" in w) {
      return val !== w.not; // { not: null } → non-null
    }
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
    const client = {
      product: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          return store.products
            .filter((p) => p.tenantId === tenantId)
            .filter((p) => (where.isActive === undefined ? true : p.isActive === where.isActive))
            .filter((p) => {
              const or = where.OR as Array<Record<string, unknown>> | undefined;
              if (!or) return true;
              return or.some((cond) => {
                if ("din" in cond) return inSet(p.din, cond.din);
                if ("scheduleOverride" in cond) return inSet(p.scheduleOverride, cond.scheduleOverride);
                return false;
              });
            })
            .map((p) => ({ ...p }));
        },
        findUnique: async ({ where }: { where: { id: string } }) =>
          store.products.find((p) => p.id === where.id && p.tenantId === tenantId) ?? null,
      },
      // GLOBAL catalog — not tenant-scoped.
      drugProduct: {
        findMany: async ({ where }: { where: { din: { in: string[] } } }) =>
          store.drugs.filter((d) => where.din.in.includes(d.din)).map((d) => ({ ...d })),
        findUnique: async ({ where }: { where: { din: string } }) =>
          store.drugs.find((d) => d.din === where.din) ?? null,
      },
      storeStock: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.stock
            .filter((s) => s.tenantId === tenantId)
            .filter((s) => (where.storeId === undefined ? true : s.storeId === where.storeId))
            .filter((s) => (where.productId === undefined ? true : inSet(s.productId, where.productId)))
            .map((s) => ({ ...s })),
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const row = store.stock.find(
            (s) =>
              s.tenantId === tenantId &&
              s.storeId === where.storeId &&
              s.productId === where.productId &&
              (where.variantId === undefined || s.variantId === where.variantId),
          );
          return row ? { ...row } : null;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<StockRow> }) => {
          const row = store.stock.find((s) => s.id === where.id && s.tenantId === tenantId);
          if (!row) throw new Error("stock not found");
          Object.assign(row, data);
          return { ...row };
        },
        create: async ({ data }: { data: Partial<StockRow> }) => {
          const row: StockRow = {
            id: `stk-${++store.seq}`,
            tenantId,
            storeId: data.storeId!,
            productId: data.productId!,
            variantId: data.variantId ?? null,
            quantity: data.quantity ?? 0,
          };
          store.stock.push(row);
          return { ...row };
        },
      },
      stockMovement: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.movements
            .filter((m) => m.tenantId === tenantId)
            .filter((m) => (where.storeId === undefined ? true : m.storeId === where.storeId))
            .filter((m) => (where.productId === undefined ? true : inSet(m.productId, where.productId)))
            .filter((m) => dateRange(m.createdAt, where.createdAt))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((m) => ({ ...m })),
        create: async ({ data }: { data: Partial<MovementRow> }) => {
          const row: MovementRow = {
            id: `mov-${++store.seq}`,
            tenantId,
            storeId: data.storeId!,
            productId: data.productId!,
            variantId: data.variantId ?? null,
            type: data.type!,
            quantityChange: data.quantityChange!,
            quantityAfter: data.quantityAfter!,
            referenceId: data.referenceId ?? null,
            referenceType: data.referenceType ?? null,
            notes: data.notes ?? null,
            performedBy: data.performedBy!,
            createdAt: new Date(Date.now() + store.seq),
          };
          store.movements.push(row);
          return { ...row };
        },
      },
      narcoticEvent: {
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          store.events
            .filter((e) => e.tenantId === tenantId)
            .filter((e) => (where.storeId === undefined ? true : e.storeId === where.storeId))
            .filter((e) => (where.productId === undefined ? true : inSet(e.productId, where.productId)))
            .filter((e) => (where.eventType === undefined ? true : e.eventType === where.eventType))
            .filter((e) => dateRange(e.createdAt, where.createdAt))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((e) => ({ ...e })),
        create: async ({ data }: { data: Partial<EventRow> }) => {
          const row: EventRow = {
            id: `nev-${++store.seq}`,
            tenantId,
            storeId: data.storeId!,
            productId: data.productId!,
            shiftId: data.shiftId ?? null,
            eventType: data.eventType!,
            expectedQty: data.expectedQty!,
            countedQty: data.countedQty ?? null,
            quantityChange: data.quantityChange ?? null,
            discrepancy: data.discrepancy ?? null,
            reason: data.reason ?? null,
            witnessUserId: data.witnessUserId ?? null,
            createdByUserId: data.createdByUserId!,
            notes: data.notes ?? null,
            createdAt: new Date(Date.now() + store.seq),
          };
          store.events.push(row);
          return { ...row };
        },
      },
      $transaction: async (cb: (tx: unknown) => unknown) => cb(client),
    };
    return client;
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
const STORE = "store-1";
const NARC_DIN = "00654523"; // Tylenol w/ codeine → NARCOTIC
const PLAIN_DIN = "02238233"; // Lipitor → NEEDS_RX (non-narcotic)

function token(opts: { sub?: string; tenantId?: string; role?: string } = {}): string {
  return signAccessToken({
    sub: opts.sub ?? "mgr-1",
    tenantId: opts.tenantId ?? TENANT,
    storeId: STORE,
    storeIds: [STORE],
    role: opts.role ?? "ADMIN",
    email: "mgr@test.io",
    firstName: "M",
    lastName: "G",
  } as never);
}

beforeEach(() => {
  store.drugs = [
    { din: NARC_DIN, scheduleCategory: "NARCOTIC" },
    { din: PLAIN_DIN, scheduleCategory: "NEEDS_RX" },
  ];
  store.products = [
    { id: "p-narc", tenantId: TENANT, name: "Tylenol #3", sku: "T3", din: NARC_DIN, scheduleOverride: null, isActive: true },
    { id: "p-plain", tenantId: TENANT, name: "Lipitor 10", sku: "LIP", din: PLAIN_DIN, scheduleOverride: null, isActive: true },
  ];
  store.stock = [
    { id: "stk-narc", tenantId: TENANT, storeId: STORE, productId: "p-narc", variantId: null, quantity: 100 },
    { id: "stk-plain", tenantId: TENANT, storeId: STORE, productId: "p-plain", variantId: null, quantity: 50 },
  ];
  store.movements = [];
  store.events = [];
  store.seq = 0;
});

describe("GET /api/v1/narcotic/products", () => {
  it("401s without auth", async () => {
    const res = await supertest(app).get(`/api/v1/narcotic/products?storeId=${STORE}`);
    expect(res.status).toBe(401);
  });

  it("returns only NARCOTIC-scheduled products with on-hand (non-narcotic excluded)", async () => {
    const res = await supertest(app)
      .get(`/api/v1/narcotic/products?storeId=${STORE}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      productId: "p-narc",
      name: "Tylenol #3",
      sku: "T3",
      din: NARC_DIN,
      onHand: 100,
    });
  });
});

describe("POST /api/v1/narcotic/count", () => {
  it("records expected/counted/discrepancy and does NOT change store_stock", async () => {
    const res = await supertest(app)
      .post("/api/v1/narcotic/count")
      .set("Authorization", `Bearer ${token()}`)
      .send({ storeId: STORE, productId: "p-narc", countedQty: 90, witnessUserId: "wit-1" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      eventType: "COUNT",
      expectedQty: 100,
      countedQty: 90,
      discrepancy: -10,
      witnessUserId: "wit-1",
    });
    // Stock untouched.
    expect(store.stock.find((s) => s.id === "stk-narc")?.quantity).toBe(100);
    // No stock movement written.
    expect(store.movements).toHaveLength(0);
  });

  it("400s on a non-narcotic product (assertNarcotic guard)", async () => {
    const res = await supertest(app)
      .post("/api/v1/narcotic/count")
      .set("Authorization", `Bearer ${token()}`)
      .send({ storeId: STORE, productId: "p-plain", countedQty: 40 });
    expect(res.status).toBe(400);
    expect(store.events).toHaveLength(0);
  });
});

describe("POST /api/v1/narcotic/adjustment", () => {
  it("DESTRUCTION reduces store_stock, writes ADJUSTMENT_SUB movement + event atomically, log reflects it", async () => {
    const res = await supertest(app)
      .post("/api/v1/narcotic/adjustment")
      .set("Authorization", `Bearer ${token()}`)
      .send({ storeId: STORE, productId: "p-narc", eventType: "DESTRUCTION", quantity: 30, witnessUserId: "wit-1" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      eventType: "DESTRUCTION",
      expectedQty: 100,
      quantityChange: -30,
      reason: "DESTRUCTION",
      witnessUserId: "wit-1",
    });

    // store_stock reduced 100 → 70.
    expect(store.stock.find((s) => s.id === "stk-narc")?.quantity).toBe(70);

    // A single ADJUSTMENT_SUB movement was written, tagged + referencing the event.
    expect(store.movements).toHaveLength(1);
    expect(store.movements[0]).toMatchObject({
      type: "ADJUSTMENT_SUB",
      quantityChange: -30,
      quantityAfter: 70,
      referenceType: "NARCOTIC_DESTRUCTION",
      referenceId: res.body.data.id,
    });

    // The event was written.
    expect(store.events).toHaveLength(1);

    // The log GET now shows the movement with the reduced quantityAfter.
    const log = await supertest(app)
      .get(`/api/v1/narcotic/log?storeId=${STORE}&productId=p-narc`)
      .set("Authorization", `Bearer ${token()}`);
    expect(log.status).toBe(200);
    const movement = log.body.data.find((e: { kind: string }) => e.kind === "movement");
    expect(movement).toMatchObject({
      kind: "movement",
      type: "ADJUSTMENT_SUB",
      quantityAfter: 70,
      referenceType: "NARCOTIC_DESTRUCTION",
    });
  });

  it("400s on a non-narcotic product without moving stock", async () => {
    const res = await supertest(app)
      .post("/api/v1/narcotic/adjustment")
      .set("Authorization", `Bearer ${token()}`)
      .send({ storeId: STORE, productId: "p-plain", eventType: "LOSS", quantity: 5 });
    expect(res.status).toBe(400);
    expect(store.stock.find((s) => s.id === "stk-plain")?.quantity).toBe(50);
    expect(store.movements).toHaveLength(0);
    expect(store.events).toHaveLength(0);
  });

  it("400s when removing more than is on-hand (no negative controlled-substance stock)", async () => {
    const res = await supertest(app)
      .post("/api/v1/narcotic/adjustment")
      .set("Authorization", `Bearer ${token()}`)
      .send({ storeId: STORE, productId: "p-narc", eventType: "THEFT", quantity: 500 });
    expect(res.status).toBe(400);
    expect(store.stock.find((s) => s.id === "stk-narc")?.quantity).toBe(100);
    expect(store.movements).toHaveLength(0);
  });
});

describe("INVENTORY_WRITE gating", () => {
  it("lets a read-only role (ACCOUNTANT) read but 403s on a write", async () => {
    // ACCOUNTANT holds INVENTORY_READ but not INVENTORY_WRITE.
    const read = await supertest(app)
      .get(`/api/v1/narcotic/products?storeId=${STORE}`)
      .set("Authorization", `Bearer ${token({ role: "ACCOUNTANT" })}`);
    expect(read.status).toBe(200);

    const write = await supertest(app)
      .post("/api/v1/narcotic/count")
      .set("Authorization", `Bearer ${token({ role: "ACCOUNTANT" })}`)
      .send({ storeId: STORE, productId: "p-narc", countedQty: 90 });
    expect(write.status).toBe(403);
    expect(store.events).toHaveLength(0);
  });
});
