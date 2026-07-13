import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request } from "express";

// Mock the underlying audit service before importing the helper.
vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { recordAudit } from "../auditLog";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeMock.mockClear();
});

describe("recordAudit (req shape)", () => {
  function reqWith(overrides: Partial<Request> = {}): Request {
    return {
      user: {
        id: "user-1",
        tenantId: "tenant-1",
        storeId: null,
        storeIds: [],
        role: "ADMIN",
        email: "a@b.c",
        firstName: "A",
        lastName: "B",
      },
      tenantId: "tenant-1",
      ip: "10.0.0.1",
      ...overrides,
    } as unknown as Request;
  }

  it("pulls tenantId/userId/ipAddress from the request", async () => {
    await recordAudit({
      req: reqWith(),
      action: "USER_CREATED",
      entityType: "User",
      entityId: "user-99",
      newData: { email: "n@x.y" },
    });

    expect(writeMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      ipAddress: "10.0.0.1",
      action: "USER_CREATED",
      entityType: "User",
      entityId: "user-99",
      newData: { email: "n@x.y" },
    });
  });

  it("falls back to req.tenantId when req.user is missing", async () => {
    await recordAudit({
      req: reqWith({ user: undefined }),
      action: "USER_LOGGED_OUT",
      entityType: "User",
      entityId: "user-1",
    });

    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: undefined,
      }),
    );
  });

  it("throws when no tenant context is available", async () => {
    await expect(
      recordAudit({
        req: reqWith({ user: undefined, tenantId: undefined }),
        action: "USER_LOGGED_IN",
        entityType: "User",
        entityId: "user-1",
      }),
    ).rejects.toThrow(/authenticated request/);
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe("recordAudit (explicit shape)", () => {
  it("forwards the params verbatim to writeAuditLog", async () => {
    await recordAudit({
      tenantId: "tenant-2",
      userId: "user-2",
      action: "TENANT_SETTINGS_UPDATED",
      entityType: "Tenant",
      entityId: "tenant-2",
      oldData: { foo: 1 },
      newData: { foo: 2 },
      ipAddress: "127.0.0.1",
    });

    expect(writeMock).toHaveBeenCalledWith({
      tenantId: "tenant-2",
      userId: "user-2",
      action: "TENANT_SETTINGS_UPDATED",
      entityType: "Tenant",
      entityId: "tenant-2",
      oldData: { foo: 1 },
      newData: { foo: 2 },
      ipAddress: "127.0.0.1",
    });
  });
});
