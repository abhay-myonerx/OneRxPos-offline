// Reporting / dashboard aggregations for RX POS v2 //
// Every query in this file routes through the tenant-scoped
// `TenantPrismaClient` (`db`) — never `prisma` directly — so the
// extension layer enforces tenant isolation automatically. The
// services here are read-only: no audit writes, no mutations.
//
// Helpers favour `groupBy` / `aggregate` over per-row scans so the
// queries stay index-friendly. Pagination is applied to detailed
// (list-style) projections; aggregated summaries return small fixed
// shapes regardless of the underlying row count.

import type { TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import type {
  ActivityReportInput,
  AttendanceReportInput,
  DashboardSummaryInput,
  EmployeeReportInput,
  LeaveReportInput,
  PayrollReportInput,
} from "./v2-report.validation";
import { resolveDateRange } from "./v2-report.validation";

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Employee summary ────────────────────────────────────────────────────────

export async function getEmployeeSummary(db: TenantPrismaClient, input: EmployeeReportInput) {
  const where: AnyRecord = {};
  if (input.storeId) where.storeId = input.storeId;
  if (input.departmentId) where.departmentId = input.departmentId;

  const since30 = new Date();
  since30.setUTCDate(since30.getUTCDate() - 30);

  const [total, byStatus, byType, byDepartment, byStore, newHires30] = await Promise.all([
    db.employee.count({ where }),
    db.employee.groupBy({
      by: ["employmentStatus"],
      where,
      _count: { _all: true },
    }) as Promise<{ employmentStatus: string; _count: { _all: number } }[]>,
    db.employee.groupBy({
      by: ["employmentType"],
      where,
      _count: { _all: true },
    }) as Promise<{ employmentType: string; _count: { _all: number } }[]>,
    db.employee.groupBy({
      by: ["departmentId"],
      where,
      _count: { _all: true },
    }) as Promise<{ departmentId: string; _count: { _all: number } }[]>,
    db.employee.groupBy({
      by: ["storeId"],
      where,
      _count: { _all: true },
    }) as Promise<{ storeId: string | null; _count: { _all: number } }[]>,
    db.employee.count({
      where: { ...where, employmentStartDate: { gte: since30 } },
    }),
  ]);

  const departmentIds = byDepartment.map((r) => r.departmentId).filter(Boolean);
  const storeIds = byStore.map((r) => r.storeId).filter((id): id is string => Boolean(id));

  const [departments, stores] = await Promise.all([
    departmentIds.length
      ? (db.department.findMany({
          where: { id: { in: departmentIds } },
          select: { id: true, name: true, code: true },
        }) as Promise<{ id: string; name: string; code: string }[]>)
      : Promise.resolve([] as { id: string; name: string; code: string }[]),
    storeIds.length
      ? (db.store.findMany({
          where: { id: { in: storeIds } },
          select: { id: true, name: true, code: true },
        }) as Promise<{ id: string; name: string; code: string }[]>)
      : Promise.resolve([] as { id: string; name: string; code: string }[]),
  ]);
  const deptMap = new Map(departments.map((d) => [d.id, d]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const active = byStatus.find((s) => s.employmentStatus === "ACTIVE")?._count._all ?? 0;
  const onLeave = byStatus.find((s) => s.employmentStatus === "ON_LEAVE")?._count._all ?? 0;
  const terminated = byStatus
    .filter((s) =>
      ["TERMINATED", "RESIGNED", "RETIRED", "CONTRACT_ENDED"].includes(s.employmentStatus),
    )
    .reduce((acc, s) => acc + s._count._all, 0);

  return {
    summary: {
      total,
      active,
      onLeave,
      terminated,
      newHiresLast30Days: newHires30,
    },
    byStatus: byStatus.map((s) => ({
      status: s.employmentStatus,
      count: s._count._all,
    })),
    byType: byType.map((s) => ({
      type: s.employmentType,
      count: s._count._all,
    })),
    byDepartment: byDepartment.map((s) => ({
      departmentId: s.departmentId,
      departmentName: deptMap.get(s.departmentId)?.name ?? "Unknown",
      departmentCode: deptMap.get(s.departmentId)?.code ?? "",
      count: s._count._all,
    })),
    byStore: byStore.map((s) => ({
      storeId: s.storeId,
      storeName: s.storeId ? (storeMap.get(s.storeId)?.name ?? "Unknown") : "Unassigned",
      storeCode: s.storeId ? (storeMap.get(s.storeId)?.code ?? "") : "",
      count: s._count._all,
    })),
  };
}

// ─── Attendance summary ──────────────────────────────────────────────────────

export async function getAttendanceSummary(db: TenantPrismaClient, input: AttendanceReportInput) {
  const { dateFrom, dateTo } = resolveDateRange(input, 30);

  const recWhere: AnyRecord = {
    occurredAt: { gte: dateFrom, lte: dateTo },
  };
  if (input.storeId) recWhere.storeId = input.storeId;
  if (input.employeeId) recWhere.employeeId = input.employeeId;
  if (input.departmentId) {
    recWhere.employee = { departmentId: input.departmentId };
  }

  const corrWhere: AnyRecord = {
    requestedDate: { gte: dateFrom, lte: dateTo },
  };
  if (input.employeeId) corrWhere.employeeId = input.employeeId;
  if (input.departmentId) {
    corrWhere.employee = { departmentId: input.departmentId };
  }

  const [
    totalEvents,
    byEventType,
    byMethod,
    regularizedCount,
    correctionsByStatus,
    activeEmpCount,
  ] = await Promise.all([
    db.attendanceRecord.count({ where: recWhere }),
    db.attendanceRecord.groupBy({
      by: ["eventType"],
      where: recWhere,
      _count: { _all: true },
    }) as Promise<{ eventType: string; _count: { _all: number } }[]>,
    db.attendanceRecord.groupBy({
      by: ["method"],
      where: recWhere,
      _count: { _all: true },
    }) as Promise<{ method: string; _count: { _all: number } }[]>,
    db.attendanceRecord.count({
      where: { ...recWhere, isRegularized: true },
    }),
    db.attendanceCorrection.groupBy({
      by: ["status"],
      where: corrWhere,
      _count: { _all: true },
    }) as Promise<{ status: string; _count: { _all: number } }[]>,
    db.employee.count({
      where: {
        employmentStatus: "ACTIVE",
        ...(input.storeId ? { storeId: input.storeId } : {}),
        ...(input.departmentId ? { departmentId: input.departmentId } : {}),
        ...(input.employeeId ? { id: input.employeeId } : {}),
      },
    }),
  ]);

  // Unique employees who checked in at least once in the period
  const distinctCheckIns = await db.attendanceRecord.groupBy({
    by: ["employeeId"],
    where: { ...recWhere, eventType: "CHECK_IN" },
    _count: { _all: true },
  });

  const checkIns = byEventType.find((e) => e.eventType === "CHECK_IN")?._count._all ?? 0;
  const checkOuts = byEventType.find((e) => e.eventType === "CHECK_OUT")?._count._all ?? 0;

  return {
    period: {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    summary: {
      activeEmployees: activeEmpCount,
      totalEvents,
      checkIns,
      checkOuts,
      uniqueAttendees: distinctCheckIns.length,
      regularizedEvents: regularizedCount,
      pendingCorrections: correctionsByStatus.find((c) => c.status === "PENDING")?._count._all ?? 0,
      approvedCorrections:
        correctionsByStatus.find((c) => c.status === "APPROVED")?._count._all ?? 0,
      rejectedCorrections:
        correctionsByStatus.find((c) => c.status === "REJECTED")?._count._all ?? 0,
    },
    byEventType: byEventType.map((e) => ({
      eventType: e.eventType,
      count: e._count._all,
    })),
    byMethod: byMethod.map((m) => ({
      method: m.method,
      count: m._count._all,
    })),
    correctionsByStatus: correctionsByStatus.map((c) => ({
      status: c.status,
      count: c._count._all,
    })),
  };
}

// ─── Leave summary ───────────────────────────────────────────────────────────

export async function getLeaveSummary(db: TenantPrismaClient, input: LeaveReportInput) {
  const { dateFrom, dateTo } = resolveDateRange(input, 30);

  // A request "intersects" the window if it isn't entirely before
  // dateFrom and not entirely after dateTo. This matches what an HR
  // manager intuitively expects from a "leave in this period" view.
  const reqWhere: AnyRecord = {
    startDate: { lte: dateTo },
    endDate: { gte: dateFrom },
  };
  if (input.employeeId) reqWhere.employeeId = input.employeeId;
  if (input.leaveTypeId) reqWhere.leaveTypeId = input.leaveTypeId;
  if (input.departmentId) {
    reqWhere.employee = { departmentId: input.departmentId };
  }

  type LeaveStatusRow = {
    status: string;
    _count: { _all: number };
    _sum: { totalDays: unknown };
  };
  type LeaveTypeRow = {
    leaveTypeId: string;
    _count: { _all: number };
    _sum: { totalDays: unknown };
  };
  type LeaveAgg = {
    _sum: { totalDays: unknown; balanceImpactDays: unknown };
    _count: { _all: number } | number;
  };
  type EmpIdRow = { employeeId: string };

  const results: [LeaveStatusRow[], LeaveTypeRow[], LeaveAgg, EmpIdRow[]] = await Promise.all([
    db.leaveRequest.groupBy({
      by: ["status"],
      where: reqWhere,
      _count: { _all: true },
      _sum: { totalDays: true },
    }),
    db.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: { ...reqWhere, status: "APPROVED" },
      _count: { _all: true },
      _sum: { totalDays: true },
    }),
    db.leaveRequest.aggregate({
      where: reqWhere,
      _sum: { totalDays: true, balanceImpactDays: true },
      _count: { _all: true },
    }),
    db.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
        ...(input.departmentId ? { employee: { departmentId: input.departmentId } } : {}),
      },
      select: { employeeId: true },
      distinct: ["employeeId"],
    }),
  ]);
  const [byStatus, byType, daysAgg, currentOnLeaveRaw] = results;

  const typeIds = byType.map((t) => t.leaveTypeId);
  const types = typeIds.length
    ? ((await db.leaveType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true, code: true, color: true },
      })) as { id: string; name: string; code: string; color: string | null }[])
    : [];
  const typeMap = new Map(types.map((t) => [t.id, t]));

  return {
    period: {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    summary: {
      totalRequests: (daysAgg._count as { _all: number } | undefined)?._all ?? 0,
      totalDays: round2(toNumber(daysAgg._sum?.totalDays)),
      totalBalanceImpactDays: round2(toNumber(daysAgg._sum?.balanceImpactDays)),
      pending: byStatus.find((s) => s.status === "PENDING")?._count._all ?? 0,
      approved: byStatus.find((s) => s.status === "APPROVED")?._count._all ?? 0,
      rejected: byStatus.find((s) => s.status === "REJECTED")?._count._all ?? 0,
      cancelled: byStatus.find((s) => s.status === "CANCELLED")?._count._all ?? 0,
      currentlyOnLeave: currentOnLeaveRaw.length,
    },
    byStatus: byStatus.map((s) => ({
      status: s.status,
      count: s._count._all,
      totalDays: round2(toNumber(s._sum?.totalDays)),
    })),
    byType: byType.map((t) => ({
      leaveTypeId: t.leaveTypeId,
      name: typeMap.get(t.leaveTypeId)?.name ?? "Unknown",
      code: typeMap.get(t.leaveTypeId)?.code ?? "",
      color: typeMap.get(t.leaveTypeId)?.color ?? null,
      approvedRequests: t._count._all,
      approvedDays: round2(toNumber(t._sum?.totalDays)),
    })),
  };
}

// ─── Payroll summary ─────────────────────────────────────────────────────────

export async function getPayrollSummary(db: TenantPrismaClient, input: PayrollReportInput) {
  const { dateFrom, dateTo } = resolveDateRange(input, 180);

  const runWhere: AnyRecord = {
    periodStart: { lte: dateTo },
    periodEnd: { gte: dateFrom },
  };
  if (input.status) runWhere.status = input.status;
  if (input.storeId) runWhere.storeId = input.storeId;

  type RunAgg = {
    _sum: {
      totalGross: unknown;
      totalNet: unknown;
      totalDeductions: unknown;
      employeeCount: unknown;
    };
    _count: { _all: number } | number;
  };
  type RunStatusRow = {
    status: string;
    _count: { _all: number };
    _sum: {
      totalGross: unknown;
      totalNet: unknown;
      totalDeductions: unknown;
    };
  };
  type PayslipAgg = {
    _sum: { grossPay: unknown; netPay: unknown; totalDeductions: unknown };
    _count: { _all: number } | number;
  };
  type PayslipStatusRow = {
    status: string;
    _count: { _all: number };
    _sum: { grossPay: unknown; netPay: unknown };
  };
  type RunRow = {
    id: string;
    name: string;
    periodStart: Date;
    periodEnd: Date;
    payCycle: string;
    status: string;
    totalGross: unknown;
    totalNet: unknown;
    totalDeductions: unknown;
    employeeCount: number | null;
  };

  const results: [RunAgg, RunStatusRow[], PayslipAgg, PayslipStatusRow[], RunRow[]] =
    await Promise.all([
      db.payrollRun.aggregate({
        where: runWhere,
        _sum: {
          totalGross: true,
          totalNet: true,
          totalDeductions: true,
          employeeCount: true,
        },
        _count: { _all: true },
      }),
      db.payrollRun.groupBy({
        by: ["status"],
        where: runWhere,
        _count: { _all: true },
        _sum: { totalGross: true, totalNet: true, totalDeductions: true },
      }),
      db.payslip.aggregate({
        where: {
          periodStart: { lte: dateTo },
          periodEnd: { gte: dateFrom },
        },
        _sum: { grossPay: true, netPay: true, totalDeductions: true },
        _count: { _all: true },
      }),
      db.payslip.groupBy({
        by: ["status"],
        where: {
          periodStart: { lte: dateTo },
          periodEnd: { gte: dateFrom },
        },
        _count: { _all: true },
        _sum: { grossPay: true, netPay: true },
      }),
      db.payrollRun.findMany({
        where: runWhere,
        orderBy: { periodEnd: "desc" },
        take: 10,
        select: {
          id: true,
          name: true,
          periodStart: true,
          periodEnd: true,
          payCycle: true,
          status: true,
          totalGross: true,
          totalNet: true,
          totalDeductions: true,
          employeeCount: true,
        },
      }),
    ]);
  const [runTotals, runByStatus, payslipTotals, payslipByStatus, recentRuns] = results;

  return {
    period: {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    summary: {
      totalRuns: (runTotals._count as { _all: number } | undefined)?._all ?? 0,
      totalGross: round2(toNumber(runTotals._sum?.totalGross)),
      totalNet: round2(toNumber(runTotals._sum?.totalNet)),
      totalDeductions: round2(toNumber(runTotals._sum?.totalDeductions)),
      totalEmployeesPaid: toNumber(runTotals._sum?.employeeCount),
      totalPayslips: (payslipTotals._count as { _all: number } | undefined)?._all ?? 0,
      payslipGrossTotal: round2(toNumber(payslipTotals._sum?.grossPay)),
      payslipNetTotal: round2(toNumber(payslipTotals._sum?.netPay)),
    },
    runsByStatus: runByStatus.map((r) => ({
      status: r.status,
      count: r._count._all,
      totalGross: round2(toNumber(r._sum?.totalGross)),
      totalNet: round2(toNumber(r._sum?.totalNet)),
      totalDeductions: round2(toNumber(r._sum?.totalDeductions)),
    })),
    payslipsByStatus: payslipByStatus.map((r) => ({
      status: r.status,
      count: r._count._all,
      totalGross: round2(toNumber(r._sum?.grossPay)),
      totalNet: round2(toNumber(r._sum?.netPay)),
    })),
    recentRuns: recentRuns.map((r) => ({
      id: r.id,
      name: r.name,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      payCycle: r.payCycle,
      status: r.status,
      totalGross: r.totalGross?.toString() ?? "0",
      totalNet: r.totalNet?.toString() ?? "0",
      totalDeductions: r.totalDeductions?.toString() ?? "0",
      employeeCount: r.employeeCount ?? 0,
    })),
  };
}

// ─── Recent audit activity ───────────────────────────────────────────────────

export async function getRecentActivity(db: TenantPrismaClient, input: ActivityReportInput) {
  const { dateFrom, dateTo } = resolveDateRange(input, 7);

  const where: AnyRecord = {
    createdAt: { gte: dateFrom, lte: dateTo },
  };
  if (input.userId) where.userId = input.userId;
  if (input.entityType) where.entityType = input.entityType;
  if (input.action) {
    where.action = ciContains(input.action);
  }

  const [items, totalInWindow] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: input.limit,
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where }),
  ]);

  const userIds = Array.from(
    new Set(items.map((i) => i.userId).filter((id): id is string => !!id)),
  );
  const users = userIds.length
    ? ((await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      })) as {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      }[])
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    period: {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    summary: {
      totalEvents: totalInWindow,
      shown: items.length,
    },
    items: items.map((i) => {
      const u = i.userId ? userMap.get(i.userId) : undefined;
      return {
        id: i.id,
        userId: i.userId,
        userName: u ? `${u.firstName} ${u.lastName}`.trim() : null,
        userEmail: u?.email ?? null,
        action: i.action,
        entityType: i.entityType,
        entityId: i.entityId,
        ipAddress: i.ipAddress,
        createdAt: i.createdAt,
      };
    }),
  };
}

// ─── Dashboard summary (consolidated KPI feed) ───────────────────────────────

export async function getDashboardSummary(db: TenantPrismaClient, input: DashboardSummaryInput) {
  const { dateFrom, dateTo } = resolveDateRange(input, 30);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const saleWhere: AnyRecord = {
    status: { in: ["COMPLETED", "PARTIAL"] },
    createdAt: { gte: dateFrom, lte: dateTo },
  };
  if (input.storeId) saleWhere.storeId = input.storeId;

  const [
    salesAgg,
    todaySalesAgg,
    activeEmployees,
    activeProducts,
    activeStores,
    pendingLeave,
    currentlyOnLeave,
    attendanceEventsToday,
  ] = await Promise.all([
    db.sale.aggregate({
      where: saleWhere,
      _sum: { grandTotal: true },
      _count: { _all: true },
      _avg: { grandTotal: true },
    }),
    db.sale.aggregate({
      where: {
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: today, lte: todayEnd },
        ...(input.storeId ? { storeId: input.storeId } : {}),
      },
      _sum: { grandTotal: true },
      _count: { _all: true },
    }),
    db.employee.count({ where: { employmentStatus: "ACTIVE" } }),
    db.product.count({ where: { isActive: true } }),
    db.store.count({ where: { isActive: true } }),
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    db.leaveRequest.count({
      where: {
        status: "APPROVED",
        startDate: { lte: todayEnd },
        endDate: { gte: today },
      },
    }),
    db.attendanceRecord.count({
      where: {
        occurredAt: { gte: today, lte: todayEnd },
        eventType: "CHECK_IN",
        ...(input.storeId ? { storeId: input.storeId } : {}),
      },
    }),
  ]);

  return {
    period: {
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    },
    sales: {
      periodCount: (salesAgg._count as { _all: number } | undefined)?._all ?? 0,
      periodRevenue: round2(toNumber(salesAgg._sum?.grandTotal)),
      periodAvgSaleValue: round2(toNumber(salesAgg._avg?.grandTotal)),
      todayCount: (todaySalesAgg._count as { _all: number } | undefined)?._all ?? 0,
      todayRevenue: round2(toNumber(todaySalesAgg._sum?.grandTotal)),
    },
    people: {
      activeEmployees,
      checkInsToday: attendanceEventsToday,
      currentlyOnLeave,
      pendingLeaveRequests: pendingLeave,
    },
    catalog: {
      activeProducts,
      activeStores,
    },
  };
}
