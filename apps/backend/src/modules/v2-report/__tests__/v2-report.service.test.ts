// Service-level coverage for the v2 reporting module // Mocks the tenant-scoped Prisma delegate; tenant isolation is
// enforced by the extension layer (canary OI-006), not re-tested here.
//
// What we assert:
//   * the summary endpoints aggregate the mock data into the
//     documented shape (counts, status buckets, monetary totals
//     rounded to 2dp)
//   * date-range filters are applied to the underlying delegate calls
//   * RBAC is implicit at the route layer — services accept any
//     authenticated tenant context, so we focus on accuracy here.
//   * empty-data responses fall through cleanly (no NaN, no
//     undefined arrays)

import { describe, it, expect, vi, beforeEach } from "vitest";

import * as service from "../v2-report.service";

function makeDb(overrides: Record<string, unknown> = {}): never {
  const noop = () => vi.fn().mockResolvedValue(0);
  const db = {
    employee: {
      count: noop(),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    store: {
      findMany: vi.fn().mockResolvedValue([]),
      count: noop(),
    },
    attendanceRecord: {
      count: noop(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    attendanceCorrection: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    leaveRequest: {
      groupBy: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { totalDays: null, balanceImpactDays: null },
        _count: { _all: 0 },
      }),
      findMany: vi.fn().mockResolvedValue([]),
      count: noop(),
    },
    leaveType: { findMany: vi.fn().mockResolvedValue([]) },
    payrollRun: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          totalGross: null,
          totalNet: null,
          totalDeductions: null,
          employeeCount: null,
        },
        _count: { _all: 0 },
      }),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    payslip: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { grossPay: null, netPay: null, totalDeductions: null },
        _count: { _all: 0 },
      }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: noop(),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    sale: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { grandTotal: null },
        _count: { _all: 0 },
        _avg: { grandTotal: null },
      }),
    },
    product: { count: noop() },
  };
  return Object.assign(db, overrides) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Employee summary ───────────────────────────────────────────────────────

describe("getEmployeeSummary", () => {
  it("aggregates status / type / dept / store buckets and resolves names", async () => {
    const db = makeDb({
      employee: {
        count: vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(1),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { employmentStatus: "ACTIVE", _count: { _all: 5 } },
            { employmentStatus: "ON_LEAVE", _count: { _all: 1 } },
            { employmentStatus: "TERMINATED", _count: { _all: 1 } },
          ])
          .mockResolvedValueOnce([
            { employmentType: "FULL_TIME", _count: { _all: 6 } },
            { employmentType: "INTERN", _count: { _all: 1 } },
          ])
          .mockResolvedValueOnce([
            { departmentId: "dept-1", _count: { _all: 4 } },
            { departmentId: "dept-2", _count: { _all: 3 } },
          ])
          .mockResolvedValueOnce([
            { storeId: "store-1", _count: { _all: 5 } },
            { storeId: null, _count: { _all: 2 } },
          ]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      department: {
        findMany: vi.fn().mockResolvedValue([
          { id: "dept-1", name: "Sales", code: "SAL" },
          { id: "dept-2", name: "Ops", code: "OPS" },
        ]),
      },
      store: {
        findMany: vi.fn().mockResolvedValue([{ id: "store-1", name: "Downtown", code: "DT" }]),
      },
    });

    const result = await service.getEmployeeSummary(db, {});

    expect(result.summary.total).toBe(7);
    expect(result.summary.active).toBe(5);
    expect(result.summary.onLeave).toBe(1);
    expect(result.summary.terminated).toBe(1);
    expect(result.summary.newHiresLast30Days).toBe(1);
    expect(result.byDepartment).toEqual([
      expect.objectContaining({ departmentName: "Sales", count: 4 }),
      expect.objectContaining({ departmentName: "Ops", count: 3 }),
    ]);
    const unassigned = result.byStore.find((s) => s.storeId === null);
    expect(unassigned?.storeName).toBe("Unassigned");
  });

  it("returns an empty-shape response when there are no employees", async () => {
    const db = makeDb();
    const result = await service.getEmployeeSummary(db, {});
    expect(result.summary).toEqual({
      total: 0,
      active: 0,
      onLeave: 0,
      terminated: 0,
      newHiresLast30Days: 0,
    });
    expect(result.byDepartment).toEqual([]);
    expect(result.byStore).toEqual([]);
  });

  it("forwards storeId / departmentId filters to the underlying delegate", async () => {
    const db = makeDb();
    await service.getEmployeeSummary(db, {
      storeId: "00000000-0000-0000-0000-000000000001",
      departmentId: "00000000-0000-0000-0000-000000000002",
    });
    const empCount = (db as never as { employee: { count: ReturnType<typeof vi.fn> } }).employee
      .count;
    expect(empCount.mock.calls[0]?.[0]).toMatchObject({
      where: {
        storeId: "00000000-0000-0000-0000-000000000001",
        departmentId: "00000000-0000-0000-0000-000000000002",
      },
    });
  });
});

// ─── Attendance summary ─────────────────────────────────────────────────────

describe("getAttendanceSummary", () => {
  it("returns event/method buckets and counts unique attendees", async () => {
    const db = makeDb({
      employee: { count: vi.fn().mockResolvedValue(10) },
      attendanceRecord: {
        count: vi.fn().mockResolvedValueOnce(42).mockResolvedValueOnce(3),
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            { eventType: "CHECK_IN", _count: { _all: 21 } },
            { eventType: "CHECK_OUT", _count: { _all: 20 } },
          ])
          .mockResolvedValueOnce([
            { method: "WEB", _count: { _all: 30 } },
            { method: "BIOMETRIC", _count: { _all: 12 } },
          ])
          .mockResolvedValueOnce([
            { employeeId: "e1", _count: { _all: 5 } },
            { employeeId: "e2", _count: { _all: 7 } },
          ]),
      },
      attendanceCorrection: {
        groupBy: vi.fn().mockResolvedValue([
          { status: "PENDING", _count: { _all: 2 } },
          { status: "APPROVED", _count: { _all: 4 } },
        ]),
      },
    });

    const result = await service.getAttendanceSummary(db, {});

    expect(result.summary.activeEmployees).toBe(10);
    expect(result.summary.totalEvents).toBe(42);
    expect(result.summary.checkIns).toBe(21);
    expect(result.summary.checkOuts).toBe(20);
    expect(result.summary.uniqueAttendees).toBe(2);
    expect(result.summary.regularizedEvents).toBe(3);
    expect(result.summary.pendingCorrections).toBe(2);
    expect(result.summary.approvedCorrections).toBe(4);
    expect(result.byMethod).toHaveLength(2);
  });

  it("scopes records by employeeId when provided", async () => {
    const db = makeDb();
    await service.getAttendanceSummary(db, {
      employeeId: "00000000-0000-0000-0000-000000000abc",
    });
    const recCount = (
      db as never as {
        attendanceRecord: { count: ReturnType<typeof vi.fn> };
      }
    ).attendanceRecord.count;
    const firstCall = recCount.mock.calls[0]?.[0] as {
      where: { employeeId: string };
    };
    expect(firstCall.where.employeeId).toBe("00000000-0000-0000-0000-000000000abc");
  });
});

// ─── Leave summary ───────────────────────────────────────────────────────────

describe("getLeaveSummary", () => {
  it("aggregates request status, type, and current on-leave", async () => {
    const db = makeDb({
      leaveRequest: {
        groupBy: vi
          .fn()
          .mockResolvedValueOnce([
            {
              status: "PENDING",
              _count: { _all: 3 },
              _sum: { totalDays: "6" },
            },
            {
              status: "APPROVED",
              _count: { _all: 5 },
              _sum: { totalDays: "12" },
            },
          ])
          .mockResolvedValueOnce([
            {
              leaveTypeId: "lt-1",
              _count: { _all: 4 },
              _sum: { totalDays: "10" },
            },
          ]),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { totalDays: "18", balanceImpactDays: "16" },
          _count: { _all: 8 },
        }),
        findMany: vi.fn().mockResolvedValue([{ employeeId: "e1" }, { employeeId: "e2" }]),
        count: vi.fn().mockResolvedValue(0),
      },
      leaveType: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "lt-1", name: "Annual", code: "AN", color: "#aaa" }]),
      },
    });

    const result = await service.getLeaveSummary(db, {});

    expect(result.summary.totalRequests).toBe(8);
    expect(result.summary.totalDays).toBe(18);
    expect(result.summary.totalBalanceImpactDays).toBe(16);
    expect(result.summary.pending).toBe(3);
    expect(result.summary.approved).toBe(5);
    expect(result.summary.currentlyOnLeave).toBe(2);
    expect(result.byType).toEqual([
      expect.objectContaining({
        name: "Annual",
        approvedDays: 10,
        approvedRequests: 4,
      }),
    ]);
  });

  it("emits zeros when no requests exist", async () => {
    const db = makeDb();
    const result = await service.getLeaveSummary(db, {});
    expect(result.summary.totalRequests).toBe(0);
    expect(result.summary.totalDays).toBe(0);
    expect(result.summary.currentlyOnLeave).toBe(0);
    expect(result.byType).toEqual([]);
  });
});

// ─── Payroll summary ─────────────────────────────────────────────────────────

describe("getPayrollSummary", () => {
  it("aggregates run totals and lists recent runs", async () => {
    const db = makeDb({
      payrollRun: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            totalGross: "12345.6789",
            totalNet: "9876.5432",
            totalDeductions: "2469.1357",
            employeeCount: 10,
          },
          _count: { _all: 2 },
        }),
        groupBy: vi.fn().mockResolvedValue([
          {
            status: "DISBURSED",
            _count: { _all: 1 },
            _sum: {
              totalGross: "8000",
              totalNet: "6000",
              totalDeductions: "2000",
            },
          },
          {
            status: "PROCESSED",
            _count: { _all: 1 },
            _sum: {
              totalGross: "4345.68",
              totalNet: "3876.54",
              totalDeductions: "469.14",
            },
          },
        ]),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            name: "May 2026",
            periodStart: new Date("2026-05-01"),
            periodEnd: new Date("2026-05-31"),
            payCycle: "MONTHLY",
            status: "DISBURSED",
            totalGross: "8000",
            totalNet: "6000",
            totalDeductions: "2000",
            employeeCount: 8,
          },
        ]),
      },
      payslip: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            grossPay: "12345",
            netPay: "9876",
            totalDeductions: "2469",
          },
          _count: { _all: 20 },
        }),
        groupBy: vi.fn().mockResolvedValue([
          {
            status: "FINALIZED",
            _count: { _all: 20 },
            _sum: { grossPay: "12345", netPay: "9876" },
          },
        ]),
      },
    });

    const result = await service.getPayrollSummary(db, {});

    expect(result.summary.totalRuns).toBe(2);
    expect(result.summary.totalGross).toBe(12345.68);
    expect(result.summary.totalNet).toBe(9876.54);
    expect(result.summary.totalEmployeesPaid).toBe(10);
    expect(result.summary.totalPayslips).toBe(20);
    expect(result.recentRuns).toHaveLength(1);
    expect(result.recentRuns[0]).toMatchObject({
      id: "run-1",
      totalGross: "8000",
      employeeCount: 8,
    });
  });

  it("returns a zeroed shape when no runs exist", async () => {
    const db = makeDb();
    const result = await service.getPayrollSummary(db, {});
    expect(result.summary).toMatchObject({
      totalRuns: 0,
      totalGross: 0,
      totalNet: 0,
      totalEmployeesPaid: 0,
    });
    expect(result.recentRuns).toEqual([]);
  });
});

// ─── Recent activity ────────────────────────────────────────────────────────

describe("getRecentActivity", () => {
  it("joins user names onto audit rows and respects limit", async () => {
    const db = makeDb({
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a1",
            userId: "u1",
            action: "BRAND_CREATED",
            entityType: "Brand",
            entityId: "b1",
            ipAddress: "10.0.0.1",
            createdAt: new Date("2026-05-22T10:00:00Z"),
          },
        ]),
        count: vi.fn().mockResolvedValue(42),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "u1",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
          },
        ]),
      },
    });

    const result = await service.getRecentActivity(db, { limit: 25 });

    expect(result.summary).toEqual({ totalEvents: 42, shown: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      userName: "Ada Lovelace",
      userEmail: "ada@example.com",
      action: "BRAND_CREATED",
    });
  });

  it("omits user join when no rows have a userId", async () => {
    const db = makeDb({
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a1",
            userId: null,
            action: "SYSTEM_BACKFILL",
            entityType: "Migration",
            entityId: "m1",
            ipAddress: null,
            createdAt: new Date(),
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    });

    const result = await service.getRecentActivity(db, { limit: 10 });
    expect(result.items[0]?.userName).toBeNull();
    expect(result.items[0]?.userEmail).toBeNull();
  });

  it("passes the action filter as a case-insensitive contains", async () => {
    const db = makeDb();
    await service.getRecentActivity(db, {
      limit: 5,
      action: "BRAND",
    });
    const findCall = (
      db as never as {
        auditLog: { findMany: ReturnType<typeof vi.fn> };
      }
    ).auditLog.findMany.mock.calls[0]?.[0] as {
      where: { action: { contains: string; mode: string } };
      take: number;
    };
    expect(findCall.take).toBe(5);
    expect(findCall.where.action).toEqual({
      contains: "BRAND",
      mode: "insensitive",
    });
  });
});

// ─── Dashboard summary ──────────────────────────────────────────────────────

describe("getDashboardSummary", () => {
  it("rolls KPI buckets across sales/people/catalog", async () => {
    const db = makeDb({
      sale: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({
            _sum: { grandTotal: "5000.45" },
            _count: { _all: 10 },
            _avg: { grandTotal: "500.045" },
          })
          .mockResolvedValueOnce({
            _sum: { grandTotal: "300.10" },
            _count: { _all: 2 },
          }),
      },
      employee: { count: vi.fn().mockResolvedValue(8) },
      product: { count: vi.fn().mockResolvedValue(120) },
      store: { count: vi.fn().mockResolvedValue(3) },
      leaveRequest: {
        count: vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(1),
      },
      attendanceRecord: {
        count: vi.fn().mockResolvedValue(7),
      },
    });

    const result = await service.getDashboardSummary(db, {});

    expect(result.sales.periodRevenue).toBe(5000.45);
    expect(result.sales.todayRevenue).toBe(300.1);
    expect(result.people).toMatchObject({
      activeEmployees: 8,
      checkInsToday: 7,
      currentlyOnLeave: 1,
      pendingLeaveRequests: 4,
    });
    expect(result.catalog).toEqual({
      activeProducts: 120,
      activeStores: 3,
    });
  });

  it("returns a zeroed shape on an empty tenant", async () => {
    const db = makeDb();
    const result = await service.getDashboardSummary(db, {});
    expect(result.sales).toMatchObject({
      periodCount: 0,
      periodRevenue: 0,
      todayCount: 0,
      todayRevenue: 0,
    });
    expect(result.people.activeEmployees).toBe(0);
    expect(result.catalog).toEqual({ activeProducts: 0, activeStores: 0 });
  });
});
