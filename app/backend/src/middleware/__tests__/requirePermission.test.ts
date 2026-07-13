import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

import {
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
} from "../requirePermission";
import { Role } from "../../generated/prisma/enums";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";
import { AuthorizationError } from "../../shared/errors/AuthorizationError";

function makeReq(role: Role | undefined): Request {
  if (!role) return { user: undefined } as unknown as Request;
  return {
    user: {
      id: "u1",
      tenantId: "t1",
      role,
      email: "u@example.com",
      firstName: "U",
      lastName: "One",
      storeIds: [],
      storeId: null,
    },
  } as unknown as Request;
}

describe("requirePermission middleware", () => {
  it("rejects unauthenticated requests", () => {
    const next = vi.fn() as unknown as NextFunction;
    requirePermission(PERMISSIONS_V2.SALES_CREATE)(makeReq(undefined), {} as Response, next);
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("SUPER_ADMIN bypasses every permission check", () => {
    const next = vi.fn() as unknown as NextFunction;
    requirePermission(PERMISSIONS_V2.PLATFORM_TENANTS_DELETE)(
      makeReq(Role.SUPER_ADMIN),
      {} as Response,
      next,
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("ADMIN can access an ADMIN-granted permission", () => {
    const next = vi.fn() as unknown as NextFunction;
    requirePermission(PERMISSIONS_V2.USERS_CREATE)(makeReq(Role.ADMIN), {} as Response, next);
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("CASHIER is denied USERS_CREATE", () => {
    const next = vi.fn() as unknown as NextFunction;
    requirePermission(PERMISSIONS_V2.USERS_CREATE)(makeReq(Role.CASHIER), {} as Response, next);
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthorizationError);
    expect((err as AuthorizationError).message).toContain("users.create");
  });

  it("EMPLOYEE only holds ess.* permissions — denied SALES_CREATE", () => {
    const next = vi.fn() as unknown as NextFunction;
    requirePermission(PERMISSIONS_V2.SALES_CREATE)(makeReq(Role.EMPLOYEE), {} as Response, next);
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });

  it("EMPLOYEE is allowed ESS_ATTENDANCE_READ", () => {
    const next = vi.fn() as unknown as NextFunction;
    requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_READ)(
      makeReq(Role.EMPLOYEE),
      {} as Response,
      next,
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });
});

describe("requireAllPermissions middleware", () => {
  it("passes only when the actor holds every listed permission", () => {
    const next = vi.fn() as unknown as NextFunction;
    requireAllPermissions(PERMISSIONS_V2.SALES_READ, PERMISSIONS_V2.SALES_CREATE)(
      makeReq(Role.MANAGER),
      {} as Response,
      next,
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("denies when the actor is missing one of the listed permissions", () => {
    const next = vi.fn() as unknown as NextFunction;
    // CASHIER has SALES_CREATE but not USERS_CREATE.
    requireAllPermissions(PERMISSIONS_V2.SALES_CREATE, PERMISSIONS_V2.USERS_CREATE)(
      makeReq(Role.CASHIER),
      {} as Response,
      next,
    );
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(AuthorizationError);
    expect((err as AuthorizationError).message).toContain("users.create");
  });
});

describe("requireAnyPermission middleware", () => {
  it("passes when the actor holds at least one listed permission", () => {
    const next = vi.fn() as unknown as NextFunction;
    // CASHIER has SALES_CREATE.
    requireAnyPermission(PERMISSIONS_V2.USERS_CREATE, PERMISSIONS_V2.SALES_CREATE)(
      makeReq(Role.CASHIER),
      {} as Response,
      next,
    );
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("denies when the actor holds none of the listed permissions", () => {
    const next = vi.fn() as unknown as NextFunction;
    // EMPLOYEE has none of these.
    requireAnyPermission(
      PERMISSIONS_V2.USERS_CREATE,
      PERMISSIONS_V2.SALES_CREATE,
      PERMISSIONS_V2.HR_PAYROLL_RUN_APPROVE,
    )(makeReq(Role.EMPLOYEE), {} as Response, next);
    expect((next as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(AuthorizationError);
  });
});
