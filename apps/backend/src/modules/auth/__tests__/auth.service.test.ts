// Unit tests for the auth service login / refresh flow.
//
// These tests deliberately mock the Prisma client and the password util so
// the suite stays hermetic — DB-level / cross-tenant canary lives behind
// OI-006 (testcontainers).
//
// Scenarios covered (from Prompt 6 acceptance list):
//   - successful login
//   - wrong password
//   - inactive user
//   - suspended tenant
//   - cancelled tenant
//   - non-existent email
//   - duplicate email across multiple tenants
//   - refresh: invalid jwt
//   - refresh: stolen / replayed token (theft detection)
//   - refresh: expired token

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Prisma + password util mocks ────────────────────────────────────────────
//
// vi.mock factories are hoisted above this file's imports, so the mock
// instances themselves must be declared via vi.hoisted (which runs first).
// argon2 verification is intentionally expensive (~50ms each); mocking it
// also keeps the suite fast and deterministic.

const { prismaMock, verifyPasswordMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    store: {
      findMany: vi.fn(),
    },
  },
  verifyPasswordMock: vi.fn(),
}));

vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
}));

vi.mock("../../../shared/utils/password", () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
}));

// Suppress info-level logs during tests
vi.mock("../../../shared/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER mocks are declared so the SUT picks up our stubs.
import * as authService from "../auth.service";
import { AuthenticationError } from "../../../shared/errors/AuthenticationError";
import { ValidationError } from "../../../shared/errors/ValidationError";

const VALID_USER = {
  id: "user-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  email: "owner@example.com",
  passwordHash: "argon2:placeholder",
  firstName: "Owner",
  lastName: "One",
  role: "ADMIN",
  isActive: true,
  tenant: {
    id: "tenant-1",
    status: "ACTIVE",
    slug: "tenant-1",
    name: "Tenant One",
    plan: "FREE",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.update.mockResolvedValue({});
  prismaMock.refreshToken.create.mockResolvedValue({});
  prismaMock.store.findMany.mockResolvedValue([{ id: "store-1" }]);
});

describe("authService.login", () => {
  it("returns tokens + safe user profile on valid credentials", async () => {
    prismaMock.user.findMany.mockResolvedValue([VALID_USER]);
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authService.login({
      email: "owner@example.com",
      password: "Password1",
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.user).toEqual({
      id: "user-1",
      email: "owner@example.com",
      firstName: "Owner",
      lastName: "One",
      role: "ADMIN",
      storeId: "store-1",
      permissions: expect.any(Array),
    });
    // Permissions are derived from the ADMIN default grant set and
    // should be non-empty + free of any platform.* tokens (ADMIN is
    // a tenant role, never platform-scope).
    expect((result.user as { permissions: string[] }).permissions.length).toBeGreaterThan(0);
    for (const p of (result.user as { permissions: string[] }).permissions) {
      expect(p.startsWith("platform.")).toBe(false);
    }
    // The DB-side passwordHash must NEVER appear in the response.
    expect(JSON.stringify(result)).not.toContain("argon2:placeholder");
    expect(JSON.stringify(result)).not.toContain("passwordHash");

    // lastLoginAt is updated on successful login.
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastLoginAt: expect.any(Date) },
    });

    // Refresh token persisted for rotation/theft-detection.
    expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong password with a generic error", async () => {
    prismaMock.user.findMany.mockResolvedValue([VALID_USER]);
    verifyPasswordMock.mockResolvedValue(false);

    await expect(
      authService.login({
        email: "owner@example.com",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({
      name: "AuthenticationError",
      message: "Invalid email or password",
    });
    // No login bookkeeping should occur on a failed attempt.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it("returns the same generic error for a non-existent email (no enumeration)", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await expect(
      authService.login({
        email: "ghost@example.com",
        password: "Password1",
      }),
    ).rejects.toMatchObject({
      name: "AuthenticationError",
      message: "Invalid email or password",
    });
    // Password hash MUST NOT be checked when the user is unknown — but
    // the error message must be identical to the wrong-password case so
    // an attacker cannot enumerate registered accounts.
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects an inactive user without leaking why", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ ...VALID_USER, isActive: false }]);
    verifyPasswordMock.mockResolvedValue(true);

    await expect(
      authService.login({
        email: "owner@example.com",
        password: "Password1",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
  });

  it("rejects a suspended tenant", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { ...VALID_USER, tenant: { ...VALID_USER.tenant, status: "SUSPENDED" } },
    ]);

    await expect(
      authService.login({
        email: "owner@example.com",
        password: "Password1",
      }),
    ).rejects.toMatchObject({
      name: "AuthenticationError",
    });
    // Password is never even checked on a suspended tenant.
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("rejects a cancelled tenant", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { ...VALID_USER, tenant: { ...VALID_USER.tenant, status: "CANCELLED" } },
    ]);

    await expect(
      authService.login({
        email: "owner@example.com",
        password: "Password1",
      }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("refuses to log in when the email exists across multiple tenants", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      VALID_USER,
      { ...VALID_USER, id: "user-2", tenantId: "tenant-2" },
    ]);

    await expect(
      authService.login({
        email: "owner@example.com",
        password: "Password1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
  });

  it("expands store access for ADMIN role to all tenant stores", async () => {
    prismaMock.user.findMany.mockResolvedValue([VALID_USER]);
    verifyPasswordMock.mockResolvedValue(true);
    prismaMock.store.findMany.mockResolvedValue([
      { id: "store-1" },
      { id: "store-2" },
      { id: "store-3" },
    ]);

    await authService.login({
      email: "owner@example.com",
      password: "Password1",
    });

    expect(prismaMock.store.findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", isActive: true },
      select: { id: true },
    });
  });

  it("limits CASHIER store access to their assigned storeId", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { ...VALID_USER, role: "CASHIER", storeId: "store-1" },
    ]);
    verifyPasswordMock.mockResolvedValue(true);

    await authService.login({
      email: "owner@example.com",
      password: "Password1",
    });

    // CASHIER does not get the all-stores lookup.
    expect(prismaMock.store.findMany).not.toHaveBeenCalled();
  });
});

describe("authService.refresh", () => {
  it("rejects a syntactically invalid jwt", async () => {
    await expect(authService.refresh("not.a.jwt")).rejects.toMatchObject({
      name: "AuthenticationError",
      message: "Invalid refresh token",
    });
  });

  it("revokes all user tokens when a valid jwt is not in the DB (theft detection)", async () => {
    // Issue a token through the same signing helper used in production
    // so it verifies cleanly, then arrange for findUnique to return null.
    const { signRefreshToken } = await import("../../../shared/utils/jwt");
    const token = signRefreshToken({ sub: "user-1" });

    prismaMock.refreshToken.findUnique.mockResolvedValue(null);
    prismaMock.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

    await expect(authService.refresh(token)).rejects.toBeInstanceOf(AuthenticationError);

    // The whole point of theft detection: every token for this user
    // must be revoked when a reuse is observed.
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("rejects an expired refresh-token row even if the JWT itself is valid", async () => {
    const { signRefreshToken } = await import("../../../shared/utils/jwt");
    const token = signRefreshToken({ sub: "user-1" });

    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      token,
      expiresAt: new Date(Date.now() - 1000),
    });
    prismaMock.refreshToken.delete.mockResolvedValue({});

    await expect(authService.refresh(token)).rejects.toMatchObject({
      name: "AuthenticationError",
    });
    // Expired row is GC'd as part of the rejection.
    expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({
      where: { id: "rt-1" },
    });
  });
});
