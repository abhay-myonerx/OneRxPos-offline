// Integration tests for the Phase 2.9.5a device-profile CRUD under
// /api/v1/device-profiles. Mirrors barcode-template.routes.test.ts: mocks
// config/database with an in-memory tenant fake so tenant scoping + admin
// gating are exercised end-to-end against the real Express app.

import { describe, it, expect, beforeEach, vi } from "vitest";
import supertest from "supertest";

const { store, createTenantClientMock } = vi.hoisted(() => {
  interface Row {
    id: string;
    tenantId: string;
    storeId: string;
    kind: string;
    label: string;
    transport: string;
    connection: unknown;
    ownerStationId: string | null;
    protocol: string | null;
    config: unknown;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
  }

  const store = { rows: [] as Row[], seq: 0 };

  function clone(r: Row) {
    return { ...r, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
  }

  const createTenantClientMock = vi.fn((tenantId: string) => ({
    deviceProfile: {
      findMany: async () => {
        const out = store.rows.filter((r) => r.tenantId === tenantId);
        out.sort((a, b) => b.createdAt - a.createdAt);
        return out.map(clone);
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.rows.find((r) => r.id === where.id && r.tenantId === tenantId);
        return row ? clone(row) : null;
      },
      create: async ({ data }: { data: Partial<Row> }) => {
        const d = data as Row;
        const row: Row = {
          id: d.id ?? `dev-${store.seq + 1}`,
          storeId: d.storeId,
          kind: d.kind,
          label: d.label,
          transport: d.transport,
          connection: d.connection,
          ownerStationId: d.ownerStationId ?? null,
          protocol: d.protocol ?? null,
          config: d.config ?? null,
          isActive: d.isActive ?? true,
          tenantId,
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

function token(opts: { tenantId?: string; role?: string } = {}): string {
  return signAccessToken({
    sub: "admin-1",
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
    storeId: STORE,
    kind: "printer",
    label: "Front counter",
    transport: "network",
    connection: { kind: "network", ip: "192.168.1.50", port: 9100 },
    ...overrides,
  };
}

function createDevice(body: Record<string, unknown> = {}, opts = {}) {
  return supertest(app)
    .post("/api/v1/device-profiles")
    .set("Authorization", `Bearer ${token(opts)}`)
    .send(bodyFor(body));
}

beforeEach(() => {
  store.rows = [];
  store.seq = 0;
});

describe("POST /api/v1/device-profiles (create)", () => {
  it("401s without a token", async () => {
    const res = await supertest(app).post("/api/v1/device-profiles").send(bodyFor());
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin (writes are SETTINGS_MANAGE)", async () => {
    const res = await createDevice({}, { role: "CASHIER" });
    expect(res.status).toBe(403);
    expect(store.rows).toHaveLength(0);
  });

  it("400s on a bad kind enum", async () => {
    const res = await createDevice({ kind: "nope" });
    expect(res.status).toBe(400);
  });

  it("400s on a malformed connection (missing port)", async () => {
    const res = await createDevice({ connection: { kind: "network", ip: "1.2.3.4" } });
    expect(res.status).toBe(400);
  });

  it("creates a device for an admin and returns the DTO", async () => {
    const res = await createDevice({ label: "Scale A", kind: "scale", protocol: "nci" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      label: "Scale A",
      kind: "scale",
      transport: "network",
      protocol: "nci",
      isActive: true,
    });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ tenantId: TENANT });
  });
});

describe("GET /api/v1/device-profiles (list)", () => {
  it("is till-readable by a cashier and tenant-scoped", async () => {
    await createDevice({ label: "mine" });
    await createDevice({ label: "theirs" }, { tenantId: OTHER_TENANT });
    const res = await supertest(app)
      .get("/api/v1/device-profiles")
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { label: string }) => d.label)).toEqual(["mine"]);
  });
});

describe("PUT /api/v1/device-profiles/:id (update)", () => {
  it("updates fields and returns the new DTO", async () => {
    const created = await createDevice({ label: "before" });
    const res = await supertest(app)
      .put(`/api/v1/device-profiles/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ label: "after", isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ label: "after", isActive: false });
  });

  it("404s updating another tenant's device (tenant-scoped)", async () => {
    const theirs = await createDevice({ label: "theirs" }, { tenantId: OTHER_TENANT });
    const res = await supertest(app)
      .put(`/api/v1/device-profiles/${theirs.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`)
      .send({ label: "stolen" });
    expect(res.status).toBe(404);
    expect(store.rows[0]).toMatchObject({ label: "theirs" });
  });
});

describe("DELETE /api/v1/device-profiles/:id (delete)", () => {
  it("403s for a non-admin", async () => {
    const created = await createDevice();
    const res = await supertest(app)
      .delete(`/api/v1/device-profiles/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token({ role: "CASHIER" })}`);
    expect(res.status).toBe(403);
    expect(store.rows).toHaveLength(1);
  });

  it("hard-deletes for an admin", async () => {
    const created = await createDevice();
    const del = await supertest(app)
      .delete(`/api/v1/device-profiles/${created.body.data.id}`)
      .set("Authorization", `Bearer ${token()}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect(store.rows).toHaveLength(0);
  });
});
