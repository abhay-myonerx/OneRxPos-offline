// Integration tests for the Phase 1.4 cashier-shift (till session) endpoints
// under /api/v1/cashier-shifts — exercises the real Express app (imported
// directly; `app.ts` never calls `app.listen`). This repo has no live test-DB
// harness wired into `npm test`, so `../../../config/database` is mocked
// (mirroring `barcode-template.routes.test.ts`) — but `createTenantClient`
// returns a small in-memory fake that faithfully injects `tenantId` on create
// and filters by it on every read/mutation, so tenant scoping is exercised
// end-to-end. Sales are seeded directly into the fake store (checkout itself is
// not driven here) so the expected-cash reconciliation math is verified.

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

// ── In-memory fake for the request-scoped TenantPrismaClient ──────────────────
const { store, createTenantClientMock, seedSale } = vi.hoisted(() => {
  interface ShiftRow {
    id: string;
    tenantId: string;
    storeId: string;
    userId: string;
    openedAt: Date;
    closedAt: Date | null;
    openingCash: number;
    closingCash: number | null;
    expectedCash: number | null;
    difference: number | null;
    openingCounts: unknown;
    closingCounts: unknown;
    notes: string | null;
  }
  interface MovementRow {
    id: string;
    tenantId: string;
    shiftId: string;
    type: string;
    amount: number;
    reason: string | null;
    userId: string;
    createdAt: Date;
  }
  interface SaleRow {
    id: string;
    tenantId: string;
    shiftId: string | null;
    changeAmount: number;
    payments: { method: string; amount: number }[];
  }

  const store = {
    shifts: [] as ShiftRow[],
    movements: [] as MovementRow[],
    sales: [] as SaleRow[],
    seq: 0,
  };

  // whereMatches for shift where-clauses (id / userId / storeId / closedAt:null).
  function shiftMatches(row: ShiftRow, where: Record<string, unknown>): boolean {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.userId !== undefined && row.userId !== where.userId) return false;
    if (where.storeId !== undefined && row.storeId !== where.storeId) return false;
    if ("closedAt" in where && where.closedAt === null && row.closedAt !== null) return false;
    return true;
  }

  function cloneShift(r: ShiftRow) {
    return { ...r };
  }

  function seedSale(tenantId: string, shiftId: string, opts: {
    changeAmount?: number;
    payments?: { method: string; amount: number }[];
  }) {
    store.sales.push({
      id: `sale-${++store.seq}`,
      tenantId,
      shiftId,
      changeAmount: opts.changeAmount ?? 0,
      payments: opts.payments ?? [],
    });
  }

  const createTenantClientMock = vi.fn((tenantId: string) => ({
    cashierShift: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.shifts.find(
          (r) => r.tenantId === tenantId && shiftMatches(r, where),
        );
        return row ? cloneShift(row) : null;
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const row = store.shifts.find(
          (r) => r.tenantId === tenantId && shiftMatches(r, where),
        );
        return row ? cloneShift(row) : null;
      },
      create: async ({ data }: { data: Partial<ShiftRow> }) => {
        const d = data as Partial<ShiftRow>;
        const row: ShiftRow = {
          id: `shift-${++store.seq}`,
          tenantId, // injected by the real tenant-scope extension
          storeId: d.storeId!,
          userId: d.userId!,
          openedAt: new Date(),
          closedAt: null,
          openingCash: d.openingCash!,
          closingCash: null,
          expectedCash: null,
          difference: null,
          openingCounts: d.openingCounts ?? null,
          closingCounts: null,
          notes: d.notes ?? null,
        };
        store.shifts.push(row);
        return cloneShift(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ShiftRow> }) => {
        const row = store.shifts.find((r) => r.id === where.id && r.tenantId === tenantId);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return cloneShift(row);
      },
    },
    cashMovement: {
      create: async ({ data }: { data: Partial<MovementRow> }) => {
        const d = data as Partial<MovementRow>;
        const row: MovementRow = {
          id: `mv-${++store.seq}`,
          tenantId,
          shiftId: d.shiftId!,
          type: d.type!,
          amount: d.amount!,
          reason: d.reason ?? null,
          userId: d.userId!,
          createdAt: new Date(),
        };
        store.movements.push(row);
        return { ...row };
      },
      findMany: async ({ where }: { where: { shiftId: string } }) => {
        return store.movements
          .filter((r) => r.tenantId === tenantId && r.shiftId === where.shiftId)
          .map((r) => ({ ...r }));
      },
    },
    sale: {
      findMany: async ({ where }: { where: { shiftId: string } }) => {
        return store.sales
          .filter((r) => r.tenantId === tenantId && r.shiftId === where.shiftId)
          .map((r) => ({ changeAmount: r.changeAmount, payments: r.payments.map((p) => ({ ...p })) }));
      },
    },
  }));

  return { store, createTenantClientMock, seedSale };
});

vi.mock("../../../config/database", () => ({
  prisma: {},
  createTenantClient: createTenantClientMock,
}));

import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";

const TENANT = "tenant-1";
const OTHER_TENANT = "tenant-2";
const STORE = "store-1";

function token(opts: { sub?: string; tenantId?: string; role?: string } = {}): string {
  return signAccessToken({
    sub: opts.sub ?? "cashier-1",
    tenantId: opts.tenantId ?? TENANT,
    storeId: STORE,
    storeIds: [STORE],
    role: opts.role ?? "CASHIER",
    email: "cashier@test.io",
    firstName: "C",
    lastName: "R",
  } as never);
}

// A $200 opening float (1×100 + 1×50 + 2×20 + 1×5 + 2×2 + 1×1).
const FLOAT_200 = { "100": 1, "50": 1, "20": 2, "5": 1, "2": 2, "1": 1 };

async function openTill(counts: Record<string, number> = FLOAT_200, opts = {}) {
  return supertest(app)
    .post("/api/v1/cashier-shifts/open")
    .set("Authorization", `Bearer ${token(opts)}`)
    .send({ storeId: STORE, openingCounts: counts });
}

beforeEach(() => {
  store.shifts = [];
  store.movements = [];
  store.sales = [];
  store.seq = 0;
});

describe("POST /api/v1/cashier-shifts/open", () => {
  it("401s without an authenticated session", async () => {
    const res = await supertest(app)
      .post("/api/v1/cashier-shifts/open")
      .send({ storeId: STORE, openingCounts: FLOAT_200 });
    expect(res.status).toBe(401);
  });

  it("400s on a malformed body (negative count)", async () => {
    const res = await openTill({ "100": -1 });
    expect(res.status).toBe(400);
    expect(store.shifts).toHaveLength(0);
  });

  it("opens a till with openingCash derived from the denomination counts", async () => {
    const res = await openTill();
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      storeId: STORE,
      userId: "cashier-1",
      openingCash: 200,
      closedAt: null,
      openingCounts: FLOAT_200,
    });
    expect(res.body.data.id).toBeTruthy();
    expect(store.shifts).toHaveLength(1);
    expect(store.shifts[0]).toMatchObject({ tenantId: TENANT, openingCash: 200 });
  });

  it("409s when the caller already has an open shift at that store", async () => {
    await openTill();
    const res = await openTill();
    expect(res.status).toBe(409);
    expect(store.shifts).toHaveLength(1);
  });
});

describe("GET /api/v1/cashier-shifts/current", () => {
  it("400s when storeId is missing", async () => {
    const res = await supertest(app)
      .get("/api/v1/cashier-shifts/current")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });

  it("returns the caller's open shift", async () => {
    const opened = await openTill();
    const res = await supertest(app)
      .get(`/api/v1/cashier-shifts/current?storeId=${STORE}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(opened.body.data.id);
    expect(res.body.data.openingCash).toBe(200);
  });

  it("returns null when the caller has no open shift", async () => {
    const res = await supertest(app)
      .get(`/api/v1/cashier-shifts/current?storeId=${STORE}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});

describe("POST /api/v1/cashier-shifts/:id/cash-movement", () => {
  it("records a PAID_OUT movement", async () => {
    const opened = await openTill();
    const res = await supertest(app)
      .post(`/api/v1/cashier-shifts/${opened.body.data.id}/cash-movement`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ type: "PAID_OUT", amount: 50, reason: "petty cash" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      type: "PAID_OUT",
      amount: 50,
      reason: "petty cash",
      userId: "cashier-1",
    });
    expect(store.movements).toHaveLength(1);
  });

  it("400s on a non-positive amount", async () => {
    const opened = await openTill();
    const res = await supertest(app)
      .post(`/api/v1/cashier-shifts/${opened.body.data.id}/cash-movement`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ type: "PAID_IN", amount: 0 });
    expect(res.status).toBe(400);
  });

  it("409s when the shift is already closed", async () => {
    const opened = await openTill();
    const id = opened.body.data.id;
    await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/close`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ closingCounts: { "100": 2 } });

    const res = await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/cash-movement`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ type: "PAID_IN", amount: 10 });
    expect(res.status).toBe(409);
  });
});

describe("GET /api/v1/cashier-shifts/:id/summary + POST /:id/close (reconciliation math)", () => {
  it("computes the tender breakdown, net cash, expected cash and over/short", async () => {
    const opened = await openTill(); // opening float = 200
    const id = opened.body.data.id;

    // Two cash sales attached to this shift:
    //   A: cash 50, change 5   → net cash 45
    //   B: cash 100 + card 20, change 0 → net cash 100 (card excluded)
    seedSale(TENANT, id, { changeAmount: 5, payments: [{ method: "CASH", amount: 50 }] });
    seedSale(TENANT, id, {
      changeAmount: 0,
      payments: [
        { method: "CASH", amount: 100 },
        { method: "CARD", amount: 20 },
      ],
    });

    // Drawer movements: paid out 50, paid in 10.
    await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/cash-movement`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ type: "PAID_OUT", amount: 50 });
    await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/cash-movement`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ type: "PAID_IN", amount: 10 });

    // ── Live summary ─────────────────────────────────────────────────────
    const summary = await supertest(app)
      .get(`/api/v1/cashier-shifts/${id}/summary`)
      .set("Authorization", `Bearer ${token()}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({
      salesCount: 2,
      tenderBreakdown: { CASH: 150, CARD: 20 },
      changeTotal: 5,
      paidIn: 10,
      paidOut: 50,
      netCashFromSales: 145, // 150 cash tendered − 5 change
      expectedCash: 305, // 200 + 145 − 50 + 10
    });

    // ── Close: counted drawer = 300 → short by 5 ─────────────────────────
    const closed = await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/close`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ closingCounts: { "100": 3 } }); // = 300
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({
      closingCash: 300,
      expectedCash: 305,
      difference: -5, // 300 counted − 305 expected → short
    });
    expect(closed.body.data.closedAt).toEqual(expect.any(String));

    // current now returns null (shift closed).
    const current = await supertest(app)
      .get(`/api/v1/cashier-shifts/current?storeId=${STORE}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(current.body.data).toBeNull();
  });

  it("409s when closing an already-closed shift", async () => {
    const opened = await openTill();
    const id = opened.body.data.id;
    await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/close`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ closingCounts: { "100": 2 } });

    const res = await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/close`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ closingCounts: { "100": 2 } });
    expect(res.status).toBe(409);
  });
});

describe("tenant scoping", () => {
  it("does not let another tenant see or close a shift", async () => {
    const opened = await openTill(); // tenant-1
    const id = opened.body.data.id;

    // tenant-2 cannot fetch it as current (different tenant + user).
    const current = await supertest(app)
      .get(`/api/v1/cashier-shifts/current?storeId=${STORE}`)
      .set("Authorization", `Bearer ${token({ tenantId: OTHER_TENANT, sub: "cashier-9" })}`);
    expect(current.body.data).toBeNull();

    // tenant-2 cannot close it — reads as not-found (404).
    const close = await supertest(app)
      .post(`/api/v1/cashier-shifts/${id}/close`)
      .set("Authorization", `Bearer ${token({ tenantId: OTHER_TENANT })}`)
      .send({ closingCounts: { "100": 2 } });
    expect(close.status).toBe(404);

    // The tenant-1 shift is untouched (still open).
    expect(store.shifts[0].closedAt).toBeNull();
  });
});
