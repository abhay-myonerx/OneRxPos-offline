// Verifies the `tenantContext` middleware:
//   1. Rejects requests that reached it without an authenticated user
//      (defense-in-depth — `authenticate` should be mounted first, but a
//      missing chain link must still 401 rather than silently grant access).
//   2. Builds the tenant-scoped Prisma client from `req.user.tenantId`
//      (NEVER from req.body / req.query / req.params — see CLAUDE.md).

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { Role } from "../../generated/prisma/enums";

// The createTenantClient factory talks to the singleton prisma instance, which
// in turn needs DATABASE_URL set. We stub it so the test never touches Postgres.
const createTenantClientMock = vi.fn((tenantId: string) => ({
  __tenant: tenantId,
}));

vi.mock("../../config/database", () => ({
  createTenantClient: (tenantId: string) => createTenantClientMock(tenantId),
}));

// Import AFTER the mock is declared so the SUT picks up the stubbed factory.
import { tenantContext } from "../tenantContext";

function makeReq(user?: Partial<NonNullable<Request["user"]>>): Request {
  return (user ? { user } : {}) as unknown as Request;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe("tenantContext middleware", () => {
  beforeEach(() => {
    createTenantClientMock.mockClear();
  });

  it("rejects requests without an authenticated user", () => {
    const req = makeReq();
    const next = makeNext();

    tenantContext(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(req.db).toBeUndefined();
    expect(createTenantClientMock).not.toHaveBeenCalled();
  });

  it("rejects when authenticate populated req.user but tenantId is missing", () => {
    // Defense-in-depth: an upstream bug could attach req.user without
    // a tenantId. The middleware must NOT fall through to an unscoped
    // client in that case.
    const req = makeReq({
      id: "u1",
      storeId: null,
      storeIds: [],
      role: Role.ADMIN,
      email: "u@example.com",
      firstName: "U",
      lastName: "One",
    } as unknown as NonNullable<Request["user"]>);
    const next = makeNext();

    tenantContext(req, {} as Response, next);

    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(createTenantClientMock).not.toHaveBeenCalled();
  });

  it("attaches a tenant-scoped Prisma client built from req.user.tenantId", () => {
    const req = makeReq({
      id: "u1",
      tenantId: "tenant-A",
      storeId: "s1",
      storeIds: ["s1"],
      role: Role.ADMIN,
      email: "u@example.com",
      firstName: "U",
      lastName: "One",
    });
    const next = makeNext();

    tenantContext(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(createTenantClientMock).toHaveBeenCalledWith("tenant-A");
    expect(req.db).toEqual({ __tenant: "tenant-A" });
  });

  it("ignores any tenantId hint outside req.user (body/query are NOT trusted)", () => {
    // Simulate an attacker sending tenantId in the body. The middleware
    // must derive scope from req.user, never from request input.
    const req = {
      user: {
        id: "u1",
        tenantId: "tenant-A",
        storeId: null,
        storeIds: [],
        role: Role.CASHIER,
        email: "u@example.com",
        firstName: "U",
        lastName: "One",
      },
      body: { tenantId: "tenant-B" },
      query: { tenantId: "tenant-B" },
      params: { tenantId: "tenant-B" },
    } as unknown as Request;
    const next = makeNext();

    tenantContext(req, {} as Response, next);

    expect(createTenantClientMock).toHaveBeenCalledWith("tenant-A");
    expect(createTenantClientMock).not.toHaveBeenCalledWith("tenant-B");
  });
});
