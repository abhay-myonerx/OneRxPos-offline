// Integration tests for the Phase 1.3b parked-sale (suspend/resume) endpoints
// under /api/v2/pos/parked-sales — exercises the real Express app (imported
// directly; `app.ts` never calls `app.listen`). This repo has no live test-DB
// harness wired into `npm test`, so `../../../config/database` is mocked
// (mirroring `override.routes.test.ts` / `pin.routes.test.ts`) — but here
// `createTenantClient` returns a small in-memory fake that faithfully injects
// `tenantId` on create and filters by it on every read/mutation, so the
// tenant/store scoping the endpoints rely on is actually exercised end-to-end.

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

// ── In-memory fake for the request-scoped TenantPrismaClient ──────────────────
const { store, createTenantClientMock } = vi.hoisted(() => {
  interface Row {
    id: string;
    tenantId: string;
    storeId: string;
    cashierId: string;
    parkedByName: string | null;
    customerId: string | null;
    label: string | null;
    snapshot: unknown;
    itemCount: number;
    total: number;
    status: string;
    claimedByUserId: string | null;
    claimedAt: Date | null;
    createdAt: number; // monotonic — stand-in for a DateTime for deterministic ordering
  }

  const store = { rows: [] as Row[], seq: 0 };

  function clone(r: Row) {
    return { ...r, createdAt: new Date(r.createdAt) };
  }

  const createTenantClientMock = vi.fn((tenantId: string) => ({
    parkedSale: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.rows.find((r) => r.id === where.id && r.tenantId === tenantId);
        return row ? clone(row) : null;
      },
      findMany: async ({
        where,
      }: {
        where: { storeId?: string; status?: string };
      }) => {
        let out = store.rows.filter((r) => r.tenantId === tenantId);
        if (where?.storeId !== undefined) out = out.filter((r) => r.storeId === where.storeId);
        if (where?.status !== undefined) out = out.filter((r) => r.status === where.status);
        out = [...out].sort((a, b) => b.createdAt - a.createdAt); // newest first
        return out.map(clone);
      },
      create: async ({ data }: { data: Partial<Row> }) => {
        const d = data as Row;
        const row: Row = {
          ...d,
          claimedByUserId: d.claimedByUserId ?? null,
          claimedAt: d.claimedAt ?? null,
          tenantId, // injected by the real tenant-scope extension
          createdAt: ++store.seq,
        };
        store.rows.push(row);
        return clone(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = store.rows.find((r) => r.id === where.id && r.tenantId === tenantId);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return clone(row);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: string };
        data: Partial<Row>;
      }) => {
        const matched = store.rows.filter(
          (r) =>
            r.tenantId === tenantId &&
            r.id === where.id &&
            (where.status === undefined || r.status === where.status),
        );
        matched.forEach((r) => Object.assign(r, data));
        return { count: matched.length };
      },
    },
  }));

  return { store, createTenantClientMock };
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
const OTHER_STORE = "store-2";

function token(opts: { sub?: string; tenantId?: string } = {}): string {
  return signAccessToken({
    sub: opts.sub ?? "cashier-1",
    tenantId: opts.tenantId ?? TENANT,
    storeId: STORE,
    storeIds: [STORE],
    role: "CASHIER",
    email: "cashier@test.io",
    firstName: "C",
    lastName: "R",
  } as never);
}

function bodyFor(overrides: Record<string, unknown> = {}) {
  return {
    id: "hold-1",
    storeId: STORE,
    customerId: null,
    label: "Aisle 3",
    parkedByName: "Cashier R",
    snapshot: { items: [{ productId: "p1" }], notes: "hello" },
    itemCount: 1,
    total: 8.5,
    ...overrides,
  };
}

beforeEach(() => {
  store.rows = [];
  store.seq = 0;
});

describe("POST /api/v2/pos/parked-sales (mirror/create)", () => {
  it("401s without an authenticated session", async () => {
    const res = await supertest(app).post("/api/v2/pos/parked-sales").send(bodyFor());
    expect(res.status).toBe(401);
  });

  it("400s on a malformed body (missing snapshot)", async () => {
    const { snapshot: _omit, ...noSnapshot } = bodyFor();
    const res = await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(noSnapshot);
    expect(res.status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it("creates a hold with cashierId from the session and returns { id }", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token({ sub: "cashier-9" })}`)
      .send(bodyFor());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { id: "hold-1" } });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      id: "hold-1",
      tenantId: TENANT,
      storeId: STORE,
      cashierId: "cashier-9",
      status: "PARKED",
    });
  });

  it("is idempotent by client-supplied id — same id twice yields ONE row, updated", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ label: "first", itemCount: 1, total: 5 }));

    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ label: "second", itemCount: 3, total: 12.75 }));

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ label: "second", itemCount: 3, total: 12.75 });
  });

  it("never resurrects a CLAIMED row on a late duplicate mirror write", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor());

    await supertest(app)
      .post("/api/v2/pos/parked-sales/hold-1/claim")
      .set("Authorization", `Bearer ${token()}`)
      .send();

    // A late offline-queue mirror write arrives after the hold was claimed.
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ label: "stale", itemCount: 9 }));

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ status: "CLAIMED", label: "Aisle 3", itemCount: 1 });
  });
});

describe("GET /api/v2/pos/parked-sales (list)", () => {
  it("400s when storeId is missing", async () => {
    const res = await supertest(app)
      .get("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`);
    expect(res.status).toBe(400);
  });

  it("returns PARKED holds for the tenant+store, newest first, as the DTO shape", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ id: "hold-a", label: "older" }));
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ id: "hold-b", label: "newer" }));

    const res = await supertest(app)
      .get("/api/v2/pos/parked-sales")
      .query({ storeId: STORE })
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual(["hold-b", "hold-a"]);
    expect(res.body.data[0]).toEqual({
      id: "hold-b",
      storeId: STORE,
      customerId: null,
      label: "newer",
      parkedByName: "Cashier R",
      snapshot: { items: [{ productId: "p1" }], notes: "hello" },
      itemCount: 1,
      total: 8.5,
      cashierId: "cashier-1",
      status: "PARKED",
      createdAt: expect.any(String),
    });
  });

  it("does NOT return holds parked in a DIFFERENT store", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ id: "here", storeId: STORE }));
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ id: "elsewhere", storeId: OTHER_STORE }));

    const res = await supertest(app)
      .get("/api/v2/pos/parked-sales")
      .query({ storeId: STORE })
      .set("Authorization", `Bearer ${token()}`);

    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual(["here"]);
  });

  it("does NOT return holds belonging to a DIFFERENT tenant", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token({ tenantId: OTHER_TENANT })}`)
      .send(bodyFor({ id: "theirs" }));
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor({ id: "mine" }));

    const res = await supertest(app)
      .get("/api/v2/pos/parked-sales")
      .query({ storeId: STORE })
      .set("Authorization", `Bearer ${token()}`);

    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual(["mine"]);
  });
});

describe("POST /api/v2/pos/parked-sales/:id/claim", () => {
  it("flips PARKED→CLAIMED, returns the snapshot, and a second claim 409s", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor());

    const first = await supertest(app)
      .post("/api/v2/pos/parked-sales/hold-1/claim")
      .set("Authorization", `Bearer ${token({ sub: "cashier-2" })}`)
      .send();

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      success: true,
      data: { snapshot: { items: [{ productId: "p1" }], notes: "hello" } },
    });
    expect(store.rows[0]).toMatchObject({ status: "CLAIMED", claimedByUserId: "cashier-2" });

    const second = await supertest(app)
      .post("/api/v2/pos/parked-sales/hold-1/claim")
      .set("Authorization", `Bearer ${token({ sub: "cashier-3" })}`)
      .send();

    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      success: false,
      error: "Parked sale already claimed or not found",
    });
  });

  it("409s claiming a non-existent hold", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/parked-sales/ghost/claim")
      .set("Authorization", `Bearer ${token()}`)
      .send();
    expect(res.status).toBe(409);
  });

  it("cannot claim a hold belonging to another tenant (cross-tenant guard)", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token({ tenantId: OTHER_TENANT })}`)
      .send(bodyFor({ id: "theirs" }));

    const res = await supertest(app)
      .post("/api/v2/pos/parked-sales/theirs/claim")
      .set("Authorization", `Bearer ${token()}`)
      .send();

    expect(res.status).toBe(409);
    // The other tenant's row is untouched.
    expect(store.rows[0]).toMatchObject({ status: "PARKED" });
  });
});

describe("DELETE /api/v2/pos/parked-sales/:id (discard)", () => {
  it("marks the hold DISCARDED and it drops out of the list; discard is idempotent", async () => {
    await supertest(app)
      .post("/api/v2/pos/parked-sales")
      .set("Authorization", `Bearer ${token()}`)
      .send(bodyFor());

    const del = await supertest(app)
      .delete("/api/v2/pos/parked-sales/hold-1")
      .set("Authorization", `Bearer ${token()}`);

    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect(store.rows[0]).toMatchObject({ status: "DISCARDED" });

    const list = await supertest(app)
      .get("/api/v2/pos/parked-sales")
      .query({ storeId: STORE })
      .set("Authorization", `Bearer ${token()}`);
    expect(list.body.data).toHaveLength(0);

    // Idempotent second discard.
    const del2 = await supertest(app)
      .delete("/api/v2/pos/parked-sales/hold-1")
      .set("Authorization", `Bearer ${token()}`);
    expect(del2.status).toBe(200);
  });
});
