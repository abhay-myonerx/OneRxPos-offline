// ModuleEnabled middleware.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: { findUnique: vi.fn() },
  },
}));
vi.mock("../../config/database", () => ({ prisma: prismaMock }));
vi.mock("../../shared/utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { clearModuleCache, moduleEnabled } from "../moduleEnabled";

function makeReq(tenantId?: string): Request {
  return { tenantId } as unknown as Request;
}

beforeEach(() => {
  prismaMock.tenant.findUnique.mockReset();
  clearModuleCache();
});

describe("moduleEnabled — defaults-open", () => {
  it("passes through when the tenant has no settings (defaults true)", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ settings: {} });
    const next = vi.fn() as NextFunction;
    await moduleEnabled("kds")(makeReq("tenant-A"), {} as Response, next);
    expect((next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([]);
  });

  it("passes through when the slug is explicitly true", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: { enabledModules: { kds: true } },
    });
    const next = vi.fn() as NextFunction;
    await moduleEnabled("kds")(makeReq("tenant-A"), {} as Response, next);
    expect((next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([]);
  });

  it("503 MODULE_DISABLED when the slug is explicitly false", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: { enabledModules: { kds: false } },
    });
    const next = vi.fn() as NextFunction;
    await moduleEnabled("kds")(makeReq("tenant-A"), {} as Response, next);
    const call = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const err = call[0] as { code: string; statusCode: number };
    expect(err.code).toBe("MODULE_DISABLED");
    expect(err.statusCode).toBe(503);
  });
});

describe("moduleEnabled — operational behavior", () => {
  it("no tenant context → passes through (lets tenantContext handle it)", async () => {
    const next = vi.fn() as NextFunction;
    await moduleEnabled("hr")(makeReq(undefined), {} as Response, next);
    expect((next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([]);
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("caches per-tenant lookups for the TTL", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: { enabledModules: { hr: true } },
    });
    const next = vi.fn() as NextFunction;
    const mw = moduleEnabled("hr");
    await mw(makeReq("tenant-A"), {} as Response, next);
    await mw(makeReq("tenant-A"), {} as Response, next);
    await mw(makeReq("tenant-A"), {} as Response, next);
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(1);
  });

  it("clearModuleCache(tenantId) forces a refresh", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: { enabledModules: { hr: true } },
    });
    const next = vi.fn() as NextFunction;
    const mw = moduleEnabled("hr");
    await mw(makeReq("tenant-A"), {} as Response, next);
    clearModuleCache("tenant-A");
    await mw(makeReq("tenant-A"), {} as Response, next);
    expect(prismaMock.tenant.findUnique).toHaveBeenCalledTimes(2);
  });

  it("DB error → fail-open (pass through, log warn)", async () => {
    prismaMock.tenant.findUnique.mockRejectedValue(new Error("DB down"));
    const next = vi.fn() as NextFunction;
    await moduleEnabled("hr")(makeReq("tenant-A"), {} as Response, next);
    // next() called with no args = pass through
    expect((next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]).toEqual([]);
  });
});
