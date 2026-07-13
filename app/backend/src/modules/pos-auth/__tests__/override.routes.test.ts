// Integration tests for POST /api/v2/pos/override — exercises the real
// Express app (imported directly; `app.ts` never calls `app.listen`, that
// happens only in `server.ts`, so importing it here is side-effect free).
// Prisma is mocked (see `vi.mock("../../../config/database"` below)
// mirroring `pin.routes.test.ts` / `enroll.routes.test.ts` — this repo has
// no live test-DB harness wired into `npm test`.

import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
    userPin: {
      findUnique: vi.fn(),
    },
    enrolledDevice: {
      findFirst: vi.fn(),
    },
    pinLockout: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
  createTenantClient: vi.fn(() => ({})),
}));

const { writeAuditLogMock } = vi.hoisted(() => ({
  writeAuditLogMock: vi.fn(async () => undefined),
}));

vi.mock("../../audit/audit.service", () => ({
  writeAuditLog: writeAuditLogMock,
}));

import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";
import { hashPin } from "../pin-hash";

const TENANT = "tenant-1";
const OTHER_TENANT = "tenant-2";
const FINGERPRINT = "f".repeat(64);

function cashierToken(): string {
  return signAccessToken({
    sub: "cashier-1",
    tenantId: TENANT,
    storeId: "store-1",
    storeIds: ["store-1"],
    role: "CASHIER",
    email: "cashier@test.io",
    firstName: "C",
    lastName: "R",
  } as never);
}

describe("POST /api/v2/pos/override", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.userPin.findUnique.mockReset();
    prismaMock.enrolledDevice.findFirst.mockReset();
    prismaMock.pinLockout.findUnique.mockReset();
    prismaMock.pinLockout.upsert.mockReset();
    prismaMock.pinLockout.findUnique.mockResolvedValue(null);
    prismaMock.pinLockout.upsert.mockResolvedValue({});
    writeAuditLogMock.mockClear();
  });

  it("401s without an authenticated (cashier) session", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(401);
  });

  it("400s on a malformed body (missing context)", async () => {
    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT });

    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("mints a grant for a MANAGER authorizer with the permission + valid PIN + enrolled device, and audits success with requester+context", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "mgr-1", pinHash });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grant).toEqual(expect.any(String));
    // Compound device lookup: tenant resolved from the authorizer, not the request.
    expect(prismaMock.enrolledDevice.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, fingerprint: FINGERPRINT, revokedAt: null },
    });
    // Lockout reset to zero on a correct PIN.
    expect(prismaMock.pinLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { attempts: 0, lockedUntil: null } }),
    );
    // Success audit records who-authorized (userId), who-requested + action + context (newData).
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        userId: "mgr-1",
        action: "POS_OVERRIDE_GRANTED",
        newData: expect.objectContaining({
          authorizerUserId: "mgr-1",
          requestedByUserId: "cashier-1",
          action: "sale:discount:override",
          context: "sale-1",
        }),
      }),
    );
  });

  it("403s when the authorizer's role lacks the action's permission (CASHIER cannot authorize sale:void)", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "CASHIER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "cashier-2", pinHash });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:void", authorizerUserId: "cashier-2", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(403);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POS_OVERRIDE_DENIED", userId: "cashier-2" }),
    );
  });

  it("401s on a wrong authorizer PIN (bad credential, same as pin-login), and increments the shared lockout counter", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "mgr-1", pinHash });
    prismaMock.pinLockout.findUnique.mockResolvedValue({ userId: "mgr-1", fingerprint: FINGERPRINT, attempts: 0, lockedUntil: null });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "000000", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
    expect(prismaMock.pinLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_fingerprint: { userId: "mgr-1", fingerprint: FINGERPRINT } },
        update: { attempts: 1, lockedUntil: null },
      }),
    );
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POS_OVERRIDE_DENIED", userId: "mgr-1" }),
    );
  });

  it("locks the authorizer's (user, device) after 5 wrong PIN attempts (401 on the locking attempt itself), and a 6th attempt is refused as 423/PIN_LOCKED without checking the PIN", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "mgr-1", pinHash });

    // 5th wrong attempt (4 prior failures already recorded) crosses PIN_MAX_ATTEMPTS (5) -> locks
    // for the NEXT attempt, but this attempt is still evaluated as a bad PIN -> 401.
    prismaMock.pinLockout.findUnique.mockResolvedValue({ userId: "mgr-1", fingerprint: FINGERPRINT, attempts: 4, lockedUntil: null });

    const fifth = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "000000", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(fifth.status).toBe(401);
    expect(prismaMock.pinLockout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { attempts: 5, lockedUntil: expect.any(Date) } }),
    );

    // Now simulate the persisted locked state for the 6th attempt.
    prismaMock.userPin.findUnique.mockClear();
    prismaMock.pinLockout.findUnique.mockResolvedValue({
      userId: "mgr-1",
      fingerprint: FINGERPRINT,
      attempts: 5,
      lockedUntil: new Date(Date.now() + 15 * 60_000),
    });

    const sixth = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(sixth.status).toBe(423);
    expect(sixth.body.error.code).toBe("PIN_LOCKED");
    // Locked check happens before the PIN is even looked up.
    expect(prismaMock.userPin.findUnique).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POS_OVERRIDE_LOCKED", userId: "mgr-1" }),
    );
  });

  it("401s (as an unknown authorizer) when the authorizer belongs to a DIFFERENT tenant — cross-tenant IDOR guard, audited against the caller's tenant", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: OTHER_TENANT, role: "MANAGER", isActive: true });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(401);
    expect(prismaMock.enrolledDevice.findFirst).not.toHaveBeenCalled();
    // Audited against the CALLING cashier session's tenant, not the (unresolved) authorizer tenant.
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, action: "POS_OVERRIDE_DENIED", userId: "mgr-1" }),
    );
  });

  it("401s when the authorizer is unknown, and still writes an audit entry against the caller's tenant", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "ghost", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(401);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, action: "POS_OVERRIDE_DENIED", userId: "ghost" }),
    );
  });

  it("mints a grant for a MANAGER authorizing the UPPER_SNAKE PRICE_OVERRIDE action label (Phase 1.3a ringup gate) via the real permission check", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "mgr-1", pinHash });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "PRICE_OVERRIDE", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.grant).toEqual(expect.any(String));
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "POS_OVERRIDE_GRANTED",
        newData: expect.objectContaining({ action: "PRICE_OVERRIDE" }),
      }),
    );
  });

  it("mints a grant for a MANAGER authorizing DISCOUNT_OVER_CAP (maps to sale:discount:override)", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "mgr-1", pinHash });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "DISCOUNT_OVER_CAP", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(200);
    expect(res.body.data.grant).toEqual(expect.any(String));
  });

  it("mints a grant for a MANAGER authorizing VOID_LINE (maps to sale:void)", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "mgr-1", pinHash });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "VOID_LINE", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(200);
    expect(res.body.data.grant).toEqual(expect.any(String));
  });

  it("403s when a CASHIER (lacking price:override) is named as authorizer for the UPPER_SNAKE PRICE_OVERRIDE label", async () => {
    const pinHash = await hashPin("428193");

    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "CASHIER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue({
      tenantId: TENANT,
      storeId: "store-1",
      fingerprint: FINGERPRINT,
      revokedAt: null,
    });
    prismaMock.userPin.findUnique.mockResolvedValue({ userId: "cashier-2", pinHash });

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "PRICE_OVERRIDE", authorizerUserId: "cashier-2", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(403);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "POS_OVERRIDE_DENIED", userId: "cashier-2" }),
    );
  });

  it("403s when the device is not enrolled for the authorizer's tenant, and audits it", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tenantId: TENANT, role: "MANAGER", isActive: true });
    prismaMock.enrolledDevice.findFirst.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/v2/pos/override")
      .set("Authorization", `Bearer ${cashierToken()}`)
      .send({ action: "sale:discount:override", authorizerUserId: "mgr-1", pin: "428193", deviceFingerprint: FINGERPRINT, context: "sale-1" });

    expect(res.status).toBe(403);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, action: "POS_OVERRIDE_DENIED", userId: "mgr-1" }),
    );
  });
});
