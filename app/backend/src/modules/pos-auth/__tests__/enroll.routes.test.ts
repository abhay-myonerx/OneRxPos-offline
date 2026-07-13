// Integration tests for POST /api/v2/pos/enroll + /devices/:id/revoke —
// exercises the real Express app (imported directly; `app.ts` never calls
// `app.listen`, that happens only in `server.ts`, so importing it here is
// side-effect free). Prisma is mocked (see `vi.mock("../../../config/database"`
// below) mirroring `auth.service.test.ts` / `moduleEnabled.routing.test.ts` —
// this repo has no live test-DB harness wired into `npm test`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    enrolledDevice: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    store: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
  createTenantClient: vi.fn(() => ({})),
}));

vi.mock("../../audit/audit.service", () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";

const TENANT = "tenant-1";

function managerToken(): string {
  return signAccessToken({
    sub: "user-1",
    tenantId: TENANT,
    storeId: "store-1",
    storeIds: ["store-1"],
    role: "MANAGER",
    email: "manager@test.io",
    firstName: "M",
    lastName: "R",
  });
}

describe("POST /api/v2/pos/enroll", () => {
  it("401s without an authenticated session", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/enroll")
      .send({ storeId: "s1", fingerprint: "f".repeat(64) });
    expect(res.status).toBe(401);
  });

  describe("with a MANAGER session", () => {
    beforeEach(() => {
      prismaMock.enrolledDevice.findFirst.mockReset();
      prismaMock.enrolledDevice.findUnique.mockReset();
      prismaMock.enrolledDevice.create.mockReset();
      prismaMock.enrolledDevice.update.mockReset();
      prismaMock.enrolledDevice.updateMany.mockReset();
      prismaMock.store.findFirst.mockReset();
      // Default: the store belongs to the caller's tenant — individual
      // tests override this to simulate a cross-tenant storeId.
      prismaMock.store.findFirst.mockResolvedValue({ id: "store-1", tenantId: TENANT });
    });

    it("creates a new EnrolledDevice for a fresh fingerprint", async () => {
      const fingerprint = "f".repeat(64);
      prismaMock.enrolledDevice.findUnique.mockResolvedValue(null);
      prismaMock.enrolledDevice.create.mockResolvedValue({
        id: "device-1",
        tenantId: TENANT,
        storeId: "store-1",
        fingerprint,
        name: "Lane 1",
        enrolledByUserId: "user-1",
        enrolledAt: new Date(),
        revokedAt: null,
      });

      const res = await supertest(app)
        .post("/api/v2/pos/enroll")
        .set("Authorization", `Bearer ${managerToken()}`)
        .send({ storeId: "store-1", fingerprint, name: "Lane 1" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("device-1");
      // The storeId is verified against the caller's tenant BEFORE enrolling.
      expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
        where: { id: "store-1", tenantId: TENANT },
      });
      expect(prismaMock.enrolledDevice.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT,
          storeId: "store-1",
          fingerprint,
          name: "Lane 1",
          enrolledByUserId: "user-1",
        },
      });
    });

    it("404s when storeId belongs to a DIFFERENT tenant (cross-tenant IDOR guard) — no EnrolledDevice is created", async () => {
      // The store exists, but not under the caller's tenant.
      prismaMock.store.findFirst.mockResolvedValue(null);

      const res = await supertest(app)
        .post("/api/v2/pos/enroll")
        .set("Authorization", `Bearer ${managerToken()}`)
        .send({ storeId: "other-tenant-store", fingerprint: "f".repeat(64) });

      expect(res.status).toBe(404);
      expect(prismaMock.store.findFirst).toHaveBeenCalledWith({
        where: { id: "other-tenant-store", tenantId: TENANT },
      });
      expect(prismaMock.enrolledDevice.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.enrolledDevice.create).not.toHaveBeenCalled();
    });

    it("400s when fingerprint is too short", async () => {
      const res = await supertest(app)
        .post("/api/v2/pos/enroll")
        .set("Authorization", `Bearer ${managerToken()}`)
        .send({ storeId: "store-1", fingerprint: "short" });

      expect(res.status).toBe(400);
      expect(prismaMock.enrolledDevice.create).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/v2/pos/devices/:id/revoke", () => {
  it("401s without an authenticated session", async () => {
    const res = await supertest(app).post("/api/v2/pos/devices/device-1/revoke").send({});
    expect(res.status).toBe(401);
  });

  it("revokes the device for a MANAGER session", async () => {
    prismaMock.enrolledDevice.updateMany.mockResolvedValue({ count: 1 });

    const res = await supertest(app)
      .post("/api/v2/pos/devices/device-1/revoke")
      .set("Authorization", `Bearer ${managerToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.enrolledDevice.updateMany).toHaveBeenCalledWith({
      where: { id: "device-1", tenantId: TENANT },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
