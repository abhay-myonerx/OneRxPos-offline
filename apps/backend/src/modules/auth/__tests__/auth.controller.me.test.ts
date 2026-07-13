// Integration test for GET /auth/me — exercises the real Express app
// (mirrors the mocking pattern in `pos-auth/__tests__/pin.routes.test.ts`).
//
// Focus: /auth/me is the settings surface a ring-up gating task (later) reads
// `discountCaps` from — it's the one payload every authenticated role
// (including CASHIER) already fetches on session bootstrap, unlike
// GET /tenant/me/settings which requires the ADMIN-only `tenant:manage`
// permission.

import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("../../../config/database", () => ({
  prisma: prismaMock,
  createTenantClient: vi.fn(() => ({})),
}));

import app from "../../../app";
import { signAccessToken } from "../../../shared/utils/jwt";

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

describe("GET /auth/me", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
  });

  it("includes discountCaps merged from the tenant's settings", () => {
    prismaMock.user.findUnique.mockResolvedValue({
      preferences: {},
      employeeId: null,
      tenant: { settings: { discountCaps: { CASHIER: { percent: 5, flat: null } } } },
    });

    return supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenFor("CASHIER")}`)
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.body.data.discountCaps.CASHIER).toEqual({ percent: 5, flat: null });
        expect(res.body.data.discountCaps.MANAGER).toEqual({ percent: null, flat: null });
      });
  });

  it("falls back to code defaults when the tenant has no discountCaps override", () => {
    prismaMock.user.findUnique.mockResolvedValue({
      preferences: {},
      employeeId: null,
      tenant: { settings: {} },
    });

    return supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenFor("CASHIER")}`)
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.body.data.discountCaps).toEqual({
          CASHIER: { percent: 10, flat: null },
          MANAGER: { percent: null, flat: null },
          ADMIN: { percent: null, flat: null },
          SUPER_ADMIN: { percent: null, flat: null },
        });
      });
  });

  it("exposes the tenant's enabledSectors (pharmacy gating, Phase 2.1)", () => {
    prismaMock.user.findUnique.mockResolvedValue({
      preferences: {},
      employeeId: null,
      tenant: { settings: { enabledSectors: { pharmacy: true } } },
    });

    return supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenFor("ADMIN")}`)
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.body.data.enabledSectors.pharmacy).toBe(true);
        expect(res.body.data.enabledSectors.sample).toBe(false);
      });
  });

  it("defaults enabledSectors to all-OFF when the tenant has none set", () => {
    prismaMock.user.findUnique.mockResolvedValue({
      preferences: {},
      employeeId: null,
      tenant: { settings: {} },
    });

    return supertest(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tokenFor("CASHIER")}`)
      .then((res) => {
        expect(res.status).toBe(200);
        expect(res.body.data.enabledSectors.pharmacy).toBe(false);
      });
  });
});
