// Integration tests for the Phase 1.3c barcode-template endpoints under
// /api/v1/barcode-templates — exercises the real Express app (imported
// directly; `app.ts` never calls `app.listen`). This repo has no live test-DB
// harness wired into `npm test`, so `../../../config/database` is mocked
// (mirroring `parked-sale.routes.test.ts`) — but `createTenantClient` returns a
// small in-memory fake that faithfully injects `tenantId` on create and filters
// by it on every read/mutation, so the tenant scoping the endpoints rely on is
// actually exercised end-to-end. Admin gating is enforced by the real
// `authorize(SETTINGS_MANAGE)` middleware against the JWT role.

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

// ── In-memory fake for the request-scoped TenantPrismaClient ──────────────────
const { store, createTenantClientMock } = vi.hoisted(() => {
  interface Row {
    id: string;
    tenantId: string;
    name: string;
    matchType: string;
    matchValue: string;
    strategy: string;
    config: unknown;
    isActive: boolean;
    createdAt: number; // monotonic — stand-in for a DateTime for deterministic ordering
    updatedAt: number;
  }

  const store = { rows: [] as Row[], seq: 0 };

  function clone(r: Row) {
    return { ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
  }

  const createTenantClientMock = vi.fn((tenantId: string) => ({
    barcodeTemplate: {
      findMany: async (_args: unknown) => {
        const out = store.rows.filter((r) => r.tenantId === tenantId);
        out.sort((a, b) => b.createdAt - a.createdAt); // newest first
        return out.map(clone);
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.rows.find((r) => r.id === where.id && r.tenantId === tenantId);
        return row ? clone(row) : null;
      },
      create: async ({ data }: { data: Partial<Row> }) => {
        const d = data as Row;
        const row: Row = {
          id: d.id ?? `tmpl-${store.seq + 1}`,
          name: d.name,
          matchType: d.matchType,
          matchValue: d.matchValue,
          strategy: d.strategy,
          config: d.config,
          isActive: d.isActive ?? true,
          tenantId, // injected by the real tenant-scope extension
          createdAt: ++store.seq,
          updatedAt: store.seq,
        };
        store.rows.push(row);
        return clone(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = store.rows.find((r) => r.id === where.id && r.tenantId === tenantId);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        row.updatedAt = ++store.seq;
        return clone(row);
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        const before = store.rows.length;
        store.rows = store.rows.filter(
          (r) => !(r.id === where.id && r.tenantId === tenantId),
        );
        return { count: before - store.rows.length };
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

function token(opts: { sub?: string; tenantId?: string; role?: string } = {}): string {
  return signAccessToken({
    sub: opts.sub ?? "admin-1",
    tenantId: opts.tenantId ?? TENANT,
    storeId: STORE,
    storeIds: [STORE],
    role: opts.role ?? "ADMIN",
    email: "admin@test.io",
    firstName: "A",
    lastName: "D",
  } as never);
}

function bodyFor(overrides: Record<string, unknown> = {}) {
  return {
    name: "Rx Label",
    matchType: "prefix",
    matchValue: "RX",
    strategy: "delimited",
    config: { fields: [{ name: "rxNumber", kind: "rxNumber" }], priceDecimals: 2 },
    ...overrides,
  };
}

async function createTemplate(body: Record<string, unknown> = {}, opts = {}) {
  return supertest(app)
    .post("/api/v1/barcode-templates")
    .set("Authorization", `Bearer ${token(opts)}`)
    .send(bodyFor(body));
}

beforeEach(() => {
  store.rows = [];
  store.seq = 0;
});

describe("POST /api/v1/barcode-templates (create)", () => {
  it("401s without an authenticated session", async () => {
    const res = await supertest(app).post("/api/v1/barcode-templates").send(bodyFor());
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (cashier) — writes are admin-gated (SETTINGS_MANAGE)", async () => {
    const res = await createTemplate({}, { role: "CASHIER" });
    expect(res.status).toBe(403);
    expect(store.rows).toHaveLength(0);
  });

  it("400s on a malformed body (bad matchType enum)", async () => {
    const res = await createTemplate({ matchType: "nope" });
    expect(res.status).toBe(400);
    expect(store.rows).toHaveLength(0);
  });

  it("400s when config is missing", async () => {
    const { config: _omit, ...noConfig } = bodyFor();
    const res = await supertest(app)
      .post("/api/v1/barcode-templates")
      .set("Authorization", `Bearer ${token()}`)
      .send(noConfig);
    expect(res.status).toBe(400);
  });

  it("creates a template for an admin and returns the DTO", async () => {
    const res = await createTemplate({ name: "GS1 Priced" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      name: "GS1 Priced",
      matchType: "prefix",
      matchValue: "RX",
      strategy: "delimited",
      config: { fields: [{ name: "rxNumber", kind: "rxNumber" }], priceDecimals: 2 },
      isActive: true,
    });
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.createdAt).toEqual(expect.any(String));
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ tenantId: TENANT });
  });

  it("honors an explicit isActive:false", async () => {
    const res = await createTemplate({ isActive: false });
    expect(res.body.data.isActive).toBe(false);
  });
});

describe("GET /api/v1/barcode-templates (list)", () => {
  it("is till-readable by a non-admin cashier", async () => {
    await createTemplate({ name: "one" });
    const res = await supertest(app)
      .get("/api/v1/barcode-templates")
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("returns this tenant's templates, newest first", async () => {
    await createTemplate({ name: "older" });
    await createTemplate({ name: "newer" });

    const res = await supertest(app)
      .get("/api/v1/barcode-templates")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { name: string }) => d.name)).toEqual(["newer", "older"]);
  });

  it("does NOT return templates belonging to a DIFFERENT tenant (tenant-scoped)", async () => {
    await createTemplate({ name: "theirs" }, { tenantId: OTHER_TENANT });
    await createTemplate({ name: "mine" });

    const res = await supertest(app)
      .get("/api/v1/barcode-templates")
      .set("Authorization", `Bearer ${token()}`);

    expect(res.body.data.map((d: { name: string }) => d.name)).toEqual(["mine"]);
  });
});

describe("PUT /api/v1/barcode-templates/:id (update)", () => {
  it("403s for a non-admin", async () => {
    const created = await createTemplate();
    const res = await supertest(app)
      .put(`/api/v1/barcode-templates/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`)
      .send({ name: "hacked" });
    expect(res.status).toBe(403);
  });

  it("updates fields and returns the new DTO", async () => {
    const created = await createTemplate({ name: "before", isActive: true });
    const res = await supertest(app)
      .put(`/api/v1/barcode-templates/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "after", isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "after", isActive: false });
  });

  it("404s updating a template that belongs to another tenant (tenant-scoped)", async () => {
    const theirs = await createTemplate({ name: "theirs" }, { tenantId: OTHER_TENANT });
    const res = await supertest(app)
      .put(`/api/v1/barcode-templates/${theirs.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "stolen" });

    expect(res.status).toBe(404);
    // The other tenant's row is untouched.
    expect(store.rows[0]).toMatchObject({ name: "theirs" });
  });

  it("404s updating a non-existent template", async () => {
    const res = await supertest(app)
      .put("/api/v1/barcode-templates/ghost")
      .set("Authorization", `Bearer ${token()}`)
      .send({ name: "x" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/barcode-templates/:id (delete)", () => {
  it("403s for a non-admin", async () => {
    const created = await createTemplate();
    const res = await supertest(app)
      .delete(`/api/v1/barcode-templates/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`);
    expect(res.status).toBe(403);
    expect(store.rows).toHaveLength(1);
  });

  it("hard-deletes the template and it drops out of the list", async () => {
    const created = await createTemplate();
    const del = await supertest(app)
      .delete(`/api/v1/barcode-templates/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`);

    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect(store.rows).toHaveLength(0);

    const list = await supertest(app)
      .get("/api/v1/barcode-templates")
      .set("Authorization", `Bearer ${token()}`);
    expect(list.body.data).toHaveLength(0);
  });

  it("does NOT delete a template belonging to another tenant (tenant-scoped)", async () => {
    const theirs = await createTemplate({ name: "theirs" }, { tenantId: OTHER_TENANT });
    const res = await supertest(app)
      .delete(`/api/v1/barcode-templates/${theirs.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`);

    // deleteMany is tenant-scoped → matches nothing → still succeeds (idempotent),
    // but the other tenant's row survives.
    expect(res.status).toBe(200);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ name: "theirs" });
  });
});
