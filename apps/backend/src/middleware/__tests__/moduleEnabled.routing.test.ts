// Regression test for the moduleEnabled WIRING (not the middleware in
// isolation — that's covered by moduleEnabled.test.ts).
//
// The bug: `app.ts` mounted `moduleEnabled(slug)` BEFORE each router,
// but the routers set `authenticate`+`tenantContext` internally. So at
// gate time `req.tenantId` was undefined and the gate fell through —
// every v2 HR/ESS route was served even when the tenant disabled the
// module. The fix moves the gate inside each router (after
// authenticate+tenantContext) and, for ESS, applies the OWNING
// module's slug per route.
//
// These tests drive real routers over HTTP and assert:
//   - a disabled module returns 503 MODULE_DISABLED (gate fires now), and
//   - ESS /me/* routes are gated by their owning module, not a blanket
//     ESS slug (e.g. /me/payslips → hr.payroll; /me/leave/balance →
//     hr.leave).
//
// NOTE: a disabled module yields HTTP 503 MODULE_DISABLED (see
// ModuleDisabledError) — the documented "temporarily unavailable for
// this tenant" semantic — not 403.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// ── Mocks (hoisted so they apply to every importer of config/database) ──
const { prismaMock, tenantClientStub } = vi.hoisted(() => ({
  prismaMock: { tenant: { findUnique: vi.fn() } },
  // resolveSelf (ESS) only touches employee.findFirst; returning null
  // makes self-scoped reads end in 409 NO_LINKED_EMPLOYEE — a clean,
  // deterministic terminus that is provably NOT MODULE_DISABLED.
  tenantClientStub: { employee: { findFirst: vi.fn() } },
}));
vi.mock("../../config/database", () => ({
  prisma: prismaMock,
  createTenantClient: () => tenantClientStub,
}));
vi.mock("../../shared/utils/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { clearModuleCache } from "../moduleEnabled";
import { errorHandler } from "../errorHandler";
import { signAccessToken } from "../../shared/utils/jwt";
import departmentRoutes from "../../modules/department/department.routes";
import payrollRoutes from "../../modules/payroll/payroll.routes";
import essRoutes from "../../modules/ess/ess.routes";

const app = express();
app.use(express.json());
app.use("/api/v2/hr/departments", departmentRoutes);
app.use("/api/v2/hr/payroll", payrollRoutes);
app.use("/api/v2/me", essRoutes);
app.use(errorHandler);

const TENANT = "tenant-test";
const token = signAccessToken({
  sub: "user-1",
  tenantId: TENANT,
  storeId: null,
  storeIds: [],
  role: "CASHIER",
  email: "cashier@test.io",
  firstName: "C",
  lastName: "R",
});

let server: Server;
let baseUrl: string;

function setEnabledModules(mods: Record<string, boolean>): void {
  prismaMock.tenant.findUnique.mockResolvedValue({
    settings: { enabledModules: mods },
  });
  clearModuleCache();
}

async function get(path: string): Promise<{ status: number; code?: string }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { code?: string };
  };
  return { status: res.status, code: body?.error?.code };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  prismaMock.tenant.findUnique.mockReset();
  tenantClientStub.employee.findFirst.mockReset();
  tenantClientStub.employee.findFirst.mockResolvedValue(null);
  clearModuleCache();
});

describe("moduleEnabled wiring — back-office HR routers", () => {
  it("503 MODULE_DISABLED when the tenant disables `hr`", async () => {
    setEnabledModules({ hr: false });
    const r = await get("/api/v2/hr/departments");
    expect(r.status).toBe(503);
    expect(r.code).toBe("MODULE_DISABLED");
  });

  it("gate does NOT block when `hr` is enabled (proves authenticate+tenantContext run first)", async () => {
    setEnabledModules({ hr: true });
    const r = await get("/api/v2/hr/departments");
    expect(r.status).not.toBe(503);
    expect(r.code).not.toBe("MODULE_DISABLED");
  });

  it("503 MODULE_DISABLED when the tenant disables `hr.payroll`", async () => {
    setEnabledModules({ "hr.payroll": false });
    const r = await get("/api/v2/hr/payroll/salary-structures");
    expect(r.status).toBe(503);
    expect(r.code).toBe("MODULE_DISABLED");
  });

  it("payroll routes are NOT blocked when only `hr.leave` is disabled", async () => {
    setEnabledModules({ "hr.leave": false });
    const r = await get("/api/v2/hr/payroll/salary-structures");
    expect(r.code).not.toBe("MODULE_DISABLED");
  });
});

describe("moduleEnabled wiring — ESS uses the OWNING module slug per route", () => {
  it("/me/payslips → 503 when `hr.payroll` is disabled", async () => {
    setEnabledModules({ "hr.payroll": false });
    const r = await get("/api/v2/me/payslips");
    expect(r.status).toBe(503);
    expect(r.code).toBe("MODULE_DISABLED");
  });

  it("/me/leave/balance is NOT blocked when only `hr.payroll` is disabled (owning module = hr.leave)", async () => {
    setEnabledModules({ "hr.payroll": false });
    const r = await get("/api/v2/me/leave/balance");
    expect(r.status).not.toBe(503);
    expect(r.code).not.toBe("MODULE_DISABLED");
  });

  it("/me/leave/balance → 503 when `hr.leave` is disabled", async () => {
    setEnabledModules({ "hr.leave": false });
    const r = await get("/api/v2/me/leave/balance");
    expect(r.status).toBe(503);
    expect(r.code).toBe("MODULE_DISABLED");
  });

  it("/me/payslips is NOT blocked when only `hr.leave` is disabled (owning module = hr.payroll)", async () => {
    setEnabledModules({ "hr.leave": false });
    const r = await get("/api/v2/me/payslips");
    expect(r.code).not.toBe("MODULE_DISABLED");
  });
});
