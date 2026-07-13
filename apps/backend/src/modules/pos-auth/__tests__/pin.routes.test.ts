// Integration tests for POST /api/v2/pos/pin + /users/:id/pin-reset —
// exercises the real Express app (imported directly; `app.ts` never calls
// `app.listen`, that happens only in `server.ts`, so importing it here is
// side-effect free). Prisma is mocked (see `vi.mock("../../../config/database"`
// below) mirroring `enroll.routes.test.ts` — this repo has no live test-DB
// harness wired into `npm test`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userPin: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    enrolledDevice: {
      findFirst: vi.fn(),
    },
    pinLockout: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
    },
    store: {
      findMany: vi.fn(),
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
import { hashPin } from "../pin-hash";

const TENANT = "tenant-1";

function tokenFor(role: string, userId = "user-1"): string {
  return signAccessToken({
    sub: userId,
    tenantId: TENANT,
    storeId: "store-1",
    storeIds: ["store-1"],
    role,
    email: "person@test.io",
    firstName: "P",
    lastName: "R",
  } as never);
}

describe("POST /api/v2/pos/pin", () => {
  beforeEach(() => {
    prismaMock.userPin.upsert.mockReset();
    prismaMock.userPin.deleteMany.mockReset();
  });

  it("401s without an authenticated session", async () => {
    const res = await supertest(app).post("/api/v2/pos/pin").send({ pin: "428193" });
    expect(res.status).toBe(401);
  });

  it("sets the caller's own PIN for an authenticated user", async () => {
    prismaMock.userPin.upsert.mockResolvedValue({ userId: "user-1", pinHash: "hashed" });

    const res = await supertest(app)
      .post("/api/v2/pos/pin")
      .set("Authorization", `Bearer ${tokenFor("CASHIER")}`)
      .send({ pin: "428193" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userId).toBe("user-1");
    expect(prismaMock.userPin.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: { pinHash: expect.any(String) },
      create: { userId: "user-1", pinHash: expect.any(String) },
    });
  });

  it("400s when the PIN is weak", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/pin")
      .set("Authorization", `Bearer ${tokenFor("CASHIER")}`)
      .send({ pin: "123456" });

    expect(res.status).toBe(400);
    expect(prismaMock.userPin.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/pos/users/:id/pin-reset", () => {
  beforeEach(() => {
    prismaMock.userPin.upsert.mockReset();
    prismaMock.userPin.deleteMany.mockReset();
    prismaMock.user.findFirst.mockReset();
  });

  it("401s without an authenticated session", async () => {
    const res = await supertest(app).post("/api/v2/pos/users/user-2/pin-reset").send({});
    expect(res.status).toBe(401);
  });

  it("403s a non-manager (CASHIER) session — PERMISSIONS.USER_PIN_RESET required", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/users/user-2/pin-reset")
      .set("Authorization", `Bearer ${tokenFor("CASHIER")}`)
      .send({});

    expect(res.status).toBe(403);
    expect(prismaMock.userPin.deleteMany).not.toHaveBeenCalled();
  });

  it("resets the target user's PIN for a MANAGER session (same tenant as target user)", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-2" });
    prismaMock.userPin.deleteMany.mockResolvedValue({ count: 1 });

    const res = await supertest(app)
      .post("/api/v2/pos/users/user-2/pin-reset")
      .set("Authorization", `Bearer ${tokenFor("MANAGER")}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-2", tenantId: TENANT },
      select: { id: true },
    });
    expect(prismaMock.userPin.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-2" },
    });
  });

  it("resets the target user's PIN for an ADMIN session (holds USER_PIN_RESET)", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "user-2" });
    prismaMock.userPin.deleteMany.mockResolvedValue({ count: 1 });

    const res = await supertest(app)
      .post("/api/v2/pos/users/user-2/pin-reset")
      .set("Authorization", `Bearer ${tokenFor("ADMIN")}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prismaMock.userPin.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-2" },
    });
  });

  it("404s a MANAGER whose token tenant differs from the target user's tenant — blocks cross-tenant IDOR", async () => {
    // Target user does not belong to the caller's tenant, so findFirst
    // (scoped by both id AND tenantId) returns null.
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/v2/pos/users/user-2/pin-reset")
      .set("Authorization", `Bearer ${tokenFor("MANAGER")}`)
      .send({});

    expect(res.status).toBe(404);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-2", tenantId: TENANT },
      select: { id: true },
    });
    expect(prismaMock.userPin.deleteMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/pos/pin-login", () => {
  const FINGERPRINT = "f".repeat(64);

  beforeEach(() => {
    prismaMock.user.findFirst.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.userPin.findUnique.mockReset();
    prismaMock.enrolledDevice.findFirst.mockReset();
    prismaMock.pinLockout.findUnique.mockReset();
    prismaMock.pinLockout.upsert.mockReset();
    prismaMock.refreshToken.create.mockReset();
    prismaMock.store.findMany.mockReset();
  });

  // No `authenticate`/`tenantContext` in front of this route — it IS the
  // login. A request with no Authorization header at all must still be
  // able to reach the handler (as opposed to 401ing at middleware like
  // every other pos-auth route).
  it("has no authenticate/tenantContext middleware in front of it — an unauthenticated request reaches the handler, not a 401 from auth middleware", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null); // unknown user -> handler-level 401

    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ deviceFingerprint: FINGERPRINT, userId: "user-1", pin: "428193" });

    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        tenantId: true,
        storeId: true,
        isActive: true,
        tenant: { select: { status: true } },
      },
    });
  });

  it("issues standard access + refresh tokens for a correct PIN from an enrolled device", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique
      // 1st call — pin.service's getUser (tenant resolution)
      .mockResolvedValueOnce({
        tenantId: TENANT,
        storeId: "store-1",
        isActive: true,
        tenant: { status: "ACTIVE" },
      })
      // 2nd call — auth.service's issueTokensForUser (full user record for the payload)
      .mockResolvedValueOnce({
        id: "user-1",
        tenantId: TENANT,
        storeId: "store-1",
        role: "CASHIER",
        email: "cashier@test.io",
        firstName: "C",
        lastName: "R",
        isActive: true,
        tenant: { status: "ACTIVE" },
      });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "user-1", pinHash });
    prismaMock.pinLockout.findUnique.mockResolvedValue(null);
    prismaMock.pinLockout.upsert.mockResolvedValue({});
    prismaMock.refreshToken.create.mockResolvedValue({});

    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ deviceFingerprint: FINGERPRINT, userId: "user-1", pin: "428193" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.refreshToken).toEqual(expect.any(String));
    // Compound device lookup: tenant resolved from the user, not the request.
    expect(prismaMock.enrolledDevice.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, fingerprint: FINGERPRINT, revokedAt: null },
    });
    // Lockout reset to zero on success.
    expect(prismaMock.pinLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { attempts: 0, lockedUntil: null },
      }),
    );
  });

  it("401s an unknown user without leaking whether the userId exists (generic error)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ deviceFingerprint: FINGERPRINT, userId: "ghost", pin: "428193" });

    expect(res.status).toBe(401);
    expect(prismaMock.enrolledDevice.findFirst).not.toHaveBeenCalled();
  });

  it("401s when the device is not enrolled for THIS user's tenant — compound lookup, never fingerprint alone", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      tenantId: TENANT,
      storeId: "store-1",
      isActive: true,
      tenant: { status: "ACTIVE" },
    });
    // Simulate: this fingerprint IS enrolled, but only under some other
    // tenant — `getActiveEnrollment(tenantId, fingerprint)` scopes by BOTH,
    // so it correctly returns null here rather than matching cross-tenant.
    prismaMock.enrolledDevice.findFirst.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ deviceFingerprint: FINGERPRINT, userId: "user-1", pin: "428193" });

    expect(res.status).toBe(401);
    expect(prismaMock.enrolledDevice.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, fingerprint: FINGERPRINT, revokedAt: null },
    });
  });

  it("401s and increments the lockout counter on a wrong PIN", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValueOnce({
      tenantId: TENANT,
      storeId: "store-1",
      isActive: true,
      tenant: { status: "ACTIVE" },
    });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "user-1", pinHash });
    prismaMock.pinLockout.findUnique.mockResolvedValue({ userId: "user-1", fingerprint: FINGERPRINT, attempts: 0, lockedUntil: null });
    prismaMock.pinLockout.upsert.mockResolvedValue({});

    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ deviceFingerprint: FINGERPRINT, userId: "user-1", pin: "000000" });

    expect(res.status).toBe(401);
    expect(prismaMock.pinLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { attempts: 1, lockedUntil: null },
      }),
    );
  });

  it("423s with PIN_LOCKED (not a generic 401) when the (user, device) pair is already locked out", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      tenantId: TENANT,
      storeId: "store-1",
      isActive: true,
      tenant: { status: "ACTIVE" },
    });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.pinLockout.findUnique.mockResolvedValue({
      userId: "user-1",
      fingerprint: FINGERPRINT,
      attempts: 5,
      lockedUntil: new Date(Date.now() + 900_000),
    });

    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ deviceFingerprint: FINGERPRINT, userId: "user-1", pin: "428193" });

    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe("PIN_LOCKED");
    expect(prismaMock.userPin.findUnique).not.toHaveBeenCalled();
  });

  it("400s on a malformed body (missing deviceFingerprint)", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/pin-login")
      .send({ userId: "user-1", pin: "428193" });

    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
