// HRM Leave service // Per docs/v2/hrm-deep-dives/4.hrm-leave.md.
//
// Business rules implemented:
//   §3  — reserve-on-request, deduct-on-approve, release-on-reject,
//          refund-on-cancel (before start), row-lock via $transaction
//   §7.1 — createRequest flow (tenure check, overlap guard, day compute,
//           balance reserve inside transaction)
//   §7.2 — decide: approve converts reservation; reject releases
//   §7.3 — cancel: pre-approval releases; post-approval refunds if future
//   §7.4 — adjustBalance: manual correction on entitled/carried only
//   §13  — invariants: availableDays derived, no double-spend, SoD approver
//
// Published frozen contracts (consumed by attendance & payroll):
//   isOnApprovedLeave(db, actor, employeeId, localDate)
//   getPaidUnpaidLeaveDays(db, actor, employeeId, periodStart, periodEnd)

import { Prisma } from "../../generated/prisma/client";

import type { TenantPrismaClient } from "../../config/database";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import { Role, NotificationType } from "../../generated/prisma/enums";
import {
  notifyRoles,
  notifyUsers,
  resolveNotificationsForEntity,
  type NotificationContent,
} from "../notification/notification.service";

import { computeLeaveDays, getCycleYear } from "./leave-compute.service";
import type {
  AdjustBalanceInput,
  LeaveBalanceListInput,
  LeaveDecisionInput,
  LeavePolicyCreateInput,
  LeavePolicyListInput,
  LeavePolicyUpdateInput,
  LeaveRequestCreateInput,
  LeaveRequestListInput,
  LeaveRequestUpdateInput,
  LeaveTypeCreateInput,
  LeaveTypeListInput,
  LeaveTypeUpdateInput,
} from "./leave.validation";
import type { IsOnApprovedLeaveResult, LeaveActor, PaidUnpaidLeaveDaysResult } from "./leave.types";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALL_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "HR_MANAGER"]);
const TEAM_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MANAGER", "HR_MANAGER"]);
const SCHEDULABLE_STATUSES = new Set(["ACTIVE", "PROBATION"]);

// ─── Notification helpers ────────────────────────────────────────────────────
//
// Fire-and-forget in-app notifications. The notification service swallows its
// own errors, so a delivery hiccup can never break the leave operation that
// triggered it. Callers use `void` — these must not be awaited into the
// balance transaction.

/** Notifies the employee's linked user account (e.g. on a leave decision). */
async function notifyLeaveEmployee(
  db: TenantPrismaClient,
  tenantId: string,
  employeeId: string,
  content: NotificationContent,
): Promise<void> {
  try {
    const emp = await db.employee.findUnique({
      where: { id: employeeId },
      select: { userId: true },
    });
    if (emp?.userId) {
      await notifyUsers(tenantId, [emp.userId], content);
    }
  } catch {
    // Best-effort only — never surface to the caller.
  }
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

// Max attempts for a balance-mutating transaction before giving up.
const BALANCE_TX_MAX_ATTEMPTS = 4;

/**
 * Run a balance-mutating transaction at SERIALIZABLE isolation with retry.
 *
 * The reserve/convert/release/refund flows read a `LeaveBalance` row and
 * write it back (read-modify-write). Under the default READ COMMITTED
 * isolation two concurrent leave requests can both read the same
 * `availableDays`, both pass the sufficiency check, and both write —
 * over-reserving past entitlement (TOCTOU; deep-dive §3/§13-3).
 *
 * SERIALIZABLE makes Postgres detect the conflicting read-write set and
 * abort one transaction with a serialization failure (Prisma `P2034`).
 * We retry the aborted transaction; on retry it re-reads the now-committed
 * balance and the sufficiency check sees the reduced availability — so the
 * second requester either succeeds against the remaining balance or gets a
 * clean `INSUFFICIENT_BALANCE`, never a silent over-reservation.
 *
 * Only serialization/write-conflict aborts are retried; domain errors
 * (e.g. INSUFFICIENT_BALANCE) propagate immediately.
 */
async function runBalanceTx<T>(
  db: TenantPrismaClient,
  fn: (tx: TenantPrismaClient) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= BALANCE_TX_MAX_ATTEMPTS; attempt++) {
    try {
      // The extended TenantPrismaClient's overloaded `$transaction`
      // confounds TS overload resolution for the interactive form
      // (same TS2769 the inline call sites carried before this
      // helper centralised them); narrow to (fn, options) explicitly.
      // MUST bind to `db`: the $extends (tenant-scope) client crashes
      // with "_engineConfig undefined" if the method is detached from
      // its receiver, which breaks every leave create/approve/reject/
      // cancel that runs through this helper.
      const runInteractive = db.$transaction.bind(db) as unknown as (
        f: (tx: TenantPrismaClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
      ) => Promise<T>;
      return await runInteractive(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      const isConflict =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (isConflict && attempt < BALANCE_TX_MAX_ATTEMPTS) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  // Unreachable in practice — the loop either returns or throws.
  throw lastError;
}

async function getCallerEmployee(
  db: TenantPrismaClient,
  actor: LeaveActor,
): Promise<{ id: string; storeId: string | null; reportsToId: string | null } | null> {
  return db.employee.findFirst({
    where: { userId: actor.id },
    select: { id: true, storeId: true, reportsToId: true },
  }) as Promise<{ id: string; storeId: string | null; reportsToId: string | null } | null>;
}

async function getTeamEmployeeIds(
  db: TenantPrismaClient,
  callerEmployeeId: string,
): Promise<string[]> {
  const rows = await db.employee.findMany({
    where: { reportsToId: callerEmployeeId },
    select: { id: true },
  });
  return [callerEmployeeId, ...rows.map((r: { id: string }) => r.id)];
}

async function requestScopeWhere(
  db: TenantPrismaClient,
  actor: LeaveActor,
  scope: "self" | "team" | "all" | undefined,
  explicitEmployeeId?: string,
): Promise<Record<string, unknown>> {
  if (explicitEmployeeId) {
    if (ALL_ROLES.has(actor.role)) return { employeeId: explicitEmployeeId };
    const caller = await getCallerEmployee(db, actor);
    if (caller?.id === explicitEmployeeId) return { employeeId: explicitEmployeeId };
    if (TEAM_ROLES.has(actor.role) && caller) {
      const target = (await db.employee.findUnique({
        where: { id: explicitEmployeeId },
        select: { reportsToId: true },
      })) as { reportsToId: string | null } | null;
      if (target?.reportsToId === caller.id) return { employeeId: explicitEmployeeId };
    }
    throw new AuthorizationError("Not authorized to view leave for that employee");
  }
  const effective = scope ?? (ALL_ROLES.has(actor.role) ? "all" : "self");
  if (effective === "all") {
    if (!ALL_ROLES.has(actor.role)) throw new AuthorizationError("Missing scope: all");
    return {};
  }
  if (effective === "team") {
    if (!TEAM_ROLES.has(actor.role)) throw new AuthorizationError("Missing scope: team");
    if (ALL_ROLES.has(actor.role)) return {};
    const caller = await getCallerEmployee(db, actor);
    if (!caller) throw new AuthorizationError("Caller has no linked employee");
    const ids = await getTeamEmployeeIds(db, caller.id);
    return { employeeId: { in: ids } };
  }
  // self
  const caller = await getCallerEmployee(db, actor);
  if (!caller) {
    const err = new ConflictError("No employee record is linked to your user account");
    (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
    throw err;
  }
  return { employeeId: caller.id };
}

function derivedAvailable(bal: {
  entitledDays: Prisma.Decimal | number;
  carriedDays: Prisma.Decimal | number;
  usedDays: Prisma.Decimal | number;
  pendingDays: Prisma.Decimal | number;
}): string {
  const e = new Prisma.Decimal(bal.entitledDays.toString());
  const c = new Prisma.Decimal(bal.carriedDays.toString());
  const u = new Prisma.Decimal(bal.usedDays.toString());
  const p = new Prisma.Decimal(bal.pendingDays.toString());
  return e.plus(c).minus(u).minus(p).toFixed(2);
}

function withAvailable<
  T extends {
    entitledDays: Prisma.Decimal | number;
    carriedDays: Prisma.Decimal | number;
    usedDays: Prisma.Decimal | number;
    pendingDays: Prisma.Decimal | number;
  },
>(bal: T): T & { availableDays: string } {
  return { ...bal, availableDays: derivedAvailable(bal) };
}

// ─── Leave Types ───────────────────────────────────────────────────────────────

const leaveTypeSelect = {
  id: true,
  tenantId: true,
  name: true,
  code: true,
  isPaid: true,
  isBalanceTracked: true,
  allowHalfDay: true,
  requiresDocument: true,
  maxConsecutiveDays: true,
  color: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listLeaveTypes(
  db: TenantPrismaClient,
  _actor: LeaveActor,
  params: LeaveTypeListInput,
) {
  const { isActive, isPaid, isBalanceTracked, ...rest } = params as never as {
    isActive?: boolean;
    isPaid?: boolean;
    isBalanceTracked?: boolean;
  } & Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  if (typeof isActive === "boolean") extra.isActive = isActive;
  if (typeof isPaid === "boolean") extra.isPaid = isPaid;
  if (typeof isBalanceTracked === "boolean") extra.isBalanceTracked = isBalanceTracked;
  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields: ["name", "code"],
    extraWhere: extra,
  });
  const [rows, total] = await Promise.all([
    db.leaveType.findMany({ where, orderBy, skip, take, select: leaveTypeSelect }),
    db.leaveType.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getLeaveTypeById(db: TenantPrismaClient, _actor: LeaveActor, id: string) {
  const row = await db.leaveType.findUnique({ where: { id }, select: leaveTypeSelect });
  if (!row) throw new NotFoundError("Leave type not found");
  return row;
}

export async function createLeaveType(
  db: TenantPrismaClient,
  actor: LeaveActor,
  input: LeaveTypeCreateInput,
) {
  const existing = await db.leaveType.findFirst({
    where: { code: input.code },
    select: { id: true },
  });
  if (existing) throw new ConflictError(`Leave type with code "${input.code}" already exists`);

  const row = await db.leaveType.create({
    data: { ...input, tenantId: actor.tenantId },
    select: leaveTypeSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_TYPE_CREATED",
    entityType: "LeaveType",
    entityId: row.id,
    newData: row,
  });
  return row;
}

export async function updateLeaveType(
  db: TenantPrismaClient,
  actor: LeaveActor,
  id: string,
  input: LeaveTypeUpdateInput,
) {
  const existing = await db.leaveType.findUnique({ where: { id }, select: leaveTypeSelect });
  if (!existing) throw new NotFoundError("Leave type not found");

  if (input.code && input.code !== existing.code) {
    const dup = await db.leaveType.findFirst({
      where: { code: input.code, id: { not: id } },
      select: { id: true },
    });
    if (dup) throw new ConflictError(`Leave type with code "${input.code}" already exists`);
  }

  const row = await db.leaveType.update({
    where: { id },
    data: input,
    select: leaveTypeSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_TYPE_UPDATED",
    entityType: "LeaveType",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });
  return row;
}

export async function deactivateLeaveType(db: TenantPrismaClient, actor: LeaveActor, id: string) {
  const existing = await db.leaveType.findUnique({ where: { id }, select: leaveTypeSelect });
  if (!existing) throw new NotFoundError("Leave type not found");
  if (!existing.isActive) return existing;

  const row = await db.leaveType.update({
    where: { id },
    data: { isActive: false },
    select: leaveTypeSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_TYPE_DEACTIVATED",
    entityType: "LeaveType",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });
  return row;
}

export async function reactivateLeaveType(db: TenantPrismaClient, actor: LeaveActor, id: string) {
  const existing = await db.leaveType.findUnique({ where: { id }, select: leaveTypeSelect });
  if (!existing) throw new NotFoundError("Leave type not found");
  if (existing.isActive) return existing;

  const row = await db.leaveType.update({
    where: { id },
    data: { isActive: true },
    select: leaveTypeSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_TYPE_REACTIVATED",
    entityType: "LeaveType",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });
  return row;
}

// ─── Leave Policies ────────────────────────────────────────────────────────────

const policySelect = {
  id: true,
  tenantId: true,
  leaveTypeId: true,
  designationLevel: true,
  entitledDaysPerYear: true,
  accrualMethod: true,
  carryForwardMax: true,
  carryForwardExpiryMonths: true,
  minTenureMonths: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listLeavePolicies(
  db: TenantPrismaClient,
  _actor: LeaveActor,
  params: LeavePolicyListInput,
) {
  const { leaveTypeId, isActive, ...rest } = params as never as {
    leaveTypeId?: string;
    isActive?: boolean;
  } & Record<string, unknown>;
  const extra: Record<string, unknown> = {};
  if (leaveTypeId) extra.leaveTypeId = leaveTypeId;
  if (typeof isActive === "boolean") extra.isActive = isActive;
  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    extraWhere: extra,
  });
  const [rows, total] = await Promise.all([
    db.leavePolicy.findMany({ where, orderBy, skip, take, select: policySelect }),
    db.leavePolicy.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function createLeavePolicy(
  db: TenantPrismaClient,
  actor: LeaveActor,
  input: LeavePolicyCreateInput,
) {
  const lt = await db.leaveType.findUnique({
    where: { id: input.leaveTypeId },
    select: { id: true },
  });
  if (!lt) throw new NotFoundError("Leave type not found");

  const row = await db.leavePolicy.create({
    data: {
      tenantId: actor.tenantId,
      leaveTypeId: input.leaveTypeId,
      designationLevel: input.designationLevel ?? null,
      entitledDaysPerYear: input.entitledDaysPerYear,
      accrualMethod: input.accrualMethod,
      carryForwardMax: input.carryForwardMax ?? null,
      carryForwardExpiryMonths: input.carryForwardExpiryMonths ?? null,
      minTenureMonths: input.minTenureMonths ?? 0,
    },
    select: policySelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_POLICY_CREATED",
    entityType: "LeavePolicy",
    entityId: row.id,
    newData: row,
  });
  return row;
}

export async function updateLeavePolicy(
  db: TenantPrismaClient,
  actor: LeaveActor,
  id: string,
  input: LeavePolicyUpdateInput,
) {
  const existing = await db.leavePolicy.findUnique({ where: { id }, select: policySelect });
  if (!existing) throw new NotFoundError("Leave policy not found");

  const row = await db.leavePolicy.update({
    where: { id },
    data: {
      ...(input.designationLevel !== undefined && { designationLevel: input.designationLevel }),
      ...(input.entitledDaysPerYear !== undefined && {
        entitledDaysPerYear: input.entitledDaysPerYear,
      }),
      ...(input.accrualMethod !== undefined && { accrualMethod: input.accrualMethod }),
      ...(input.carryForwardMax !== undefined && { carryForwardMax: input.carryForwardMax }),
      ...(input.carryForwardExpiryMonths !== undefined && {
        carryForwardExpiryMonths: input.carryForwardExpiryMonths,
      }),
      ...(input.minTenureMonths !== undefined && { minTenureMonths: input.minTenureMonths }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: policySelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_POLICY_UPDATED",
    entityType: "LeavePolicy",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });
  return row;
}

// ─── Leave Balances ────────────────────────────────────────────────────────────

const balanceSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  leaveTypeId: true,
  cycleYear: true,
  entitledDays: true,
  usedDays: true,
  pendingDays: true,
  carriedDays: true,
  updatedAt: true,
} as const;

export async function listLeaveBalances(
  db: TenantPrismaClient,
  actor: LeaveActor,
  params: LeaveBalanceListInput,
) {
  const { employeeId, leaveTypeId, cycleYear, scope, ...rest } = params as never as {
    employeeId?: string;
    leaveTypeId?: string;
    cycleYear?: number;
    scope?: "self" | "team" | "all";
  } & Record<string, unknown>;

  const scopeWhere = await requestScopeWhere(db, actor, scope, employeeId);
  const extra: Record<string, unknown> = { ...scopeWhere };
  if (leaveTypeId) extra.leaveTypeId = leaveTypeId;
  if (cycleYear) extra.cycleYear = cycleYear;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    extraWhere: extra,
  });
  const [rows, total] = await Promise.all([
    db.leaveBalance.findMany({ where, orderBy, skip, take, select: balanceSelect }),
    db.leaveBalance.count({ where }),
  ]);
  return formatListResponse(rows.map(withAvailable), total, meta);
}

export async function adjustLeaveBalance(
  db: TenantPrismaClient,
  actor: LeaveActor,
  input: AdjustBalanceInput,
) {
  const employee = await db.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, tenantId: true },
  });
  if (!employee) throw new NotFoundError("Employee not found");

  const leaveType = await db.leaveType.findUnique({
    where: { id: input.leaveTypeId },
    select: { id: true },
  });
  if (!leaveType) throw new NotFoundError("Leave type not found");

  const result = await runBalanceTx(db, async (tx) => {
    // Upsert balance row if needed, then apply delta.
    const existing = await tx.leaveBalance.upsert({
      where: {
        tenantId_employeeId_leaveTypeId_cycleYear: {
          tenantId: actor.tenantId,
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          cycleYear: input.cycleYear,
        },
      },
      create: {
        tenantId: actor.tenantId,
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        cycleYear: input.cycleYear,
        entitledDays: 0,
        usedDays: 0,
        pendingDays: 0,
        carriedDays: 0,
      },
      update: {},
      select: balanceSelect,
    });

    const newEntitled = input.entitledDaysDelta
      ? new Prisma.Decimal(existing.entitledDays.toString())
          .plus(input.entitledDaysDelta)
          .toFixed(2)
      : undefined;
    const newCarried = input.carriedDaysDelta
      ? new Prisma.Decimal(existing.carriedDays.toString()).plus(input.carriedDaysDelta).toFixed(2)
      : undefined;

    if (newEntitled !== undefined && Number(newEntitled) < 0) {
      throw new ValidationError("Entitled days cannot go below zero");
    }
    if (newCarried !== undefined && Number(newCarried) < 0) {
      throw new ValidationError("Carried days cannot go below zero");
    }

    const updated = await tx.leaveBalance.update({
      where: { id: existing.id },
      data: {
        ...(newEntitled !== undefined && { entitledDays: newEntitled }),
        ...(newCarried !== undefined && { carriedDays: newCarried }),
      },
      select: balanceSelect,
    });
    return { before: existing, after: updated };
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_BALANCE_ADJUSTED",
    entityType: "LeaveBalance",
    entityId: result.after.id,
    oldData: { ...result.before, reason: input.reason },
    newData: result.after,
  });
  return withAvailable(result.after);
}

// ─── Leave Requests ────────────────────────────────────────────────────────────

const requestSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  leaveTypeId: true,
  startDate: true,
  endDate: true,
  isHalfDay: true,
  totalDays: true,
  balanceImpactDays: true,
  reason: true,
  documentUrl: true,
  status: true,
  approverId: true,
  decidedAt: true,
  decisionNotes: true,
  createdAt: true,
  updatedAt: true,
  // Hydrate the employee and leave-type so list/detail consumers can show
  // human-readable names (e.g. the HR "Team queue") without an extra round
  // trip. Only non-sensitive identity/label fields are exposed here.
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
    },
  },
  leaveType: {
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
    },
  },
} as const;

export async function listLeaveRequests(
  db: TenantPrismaClient,
  actor: LeaveActor,
  params: LeaveRequestListInput,
) {
  const { employeeId, leaveTypeId, status, from, to, scope, ...rest } = params as never as {
    employeeId?: string;
    leaveTypeId?: string;
    status?: string;
    from?: Date;
    to?: Date;
    scope?: "self" | "team" | "all";
  } & Record<string, unknown>;

  const scopeWhere = await requestScopeWhere(db, actor, scope, employeeId);
  const extra: Record<string, unknown> = { ...scopeWhere };
  if (leaveTypeId) extra.leaveTypeId = leaveTypeId;
  if (status) extra.status = status;
  if (from || to) {
    const dateRange: Record<string, unknown> = {};
    if (from) dateRange.gte = from;
    if (to) dateRange.lte = to;
    extra.startDate = dateRange;
  }

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    extraWhere: extra,
  });
  const [rows, total] = await Promise.all([
    db.leaveRequest.findMany({ where, orderBy, skip, take, select: requestSelect }),
    db.leaveRequest.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getLeaveRequestById(db: TenantPrismaClient, actor: LeaveActor, id: string) {
  const row = await db.leaveRequest.findUnique({ where: { id }, select: requestSelect });
  if (!row) throw new NotFoundError("Leave request not found");

  // Verify actor can see this request.
  await requestScopeWhere(db, actor, undefined, row.employeeId);
  return row;
}

export async function createLeaveRequest(
  db: TenantPrismaClient,
  actor: LeaveActor,
  input: LeaveRequestCreateInput,
) {
  // 1. Resolve target employee.
  let employee: {
    id: string;
    tenantId: string;
    storeId: string | null;
    employmentStatus: string;
    employmentStartDate: Date;
    reportsToId: string | null;
  };

  if (input.employeeId) {
    // Filing for another — requires hr.leave.request.create.for (enforced
    // in route middleware). Here we verify the employee is within scope.
    const raw = await db.employee.findUnique({
      where: { id: input.employeeId },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        employmentStatus: true,
        employmentStartDate: true,
        reportsToId: true,
      },
    });
    if (!raw) throw new NotFoundError("Employee not found");
    employee = raw as typeof employee;
  } else {
    // Self-service — resolve from actor's userId.
    const raw = await db.employee.findFirst({
      where: { userId: actor.id },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        employmentStatus: true,
        employmentStartDate: true,
        reportsToId: true,
      },
    });
    if (!raw) {
      const err = new ConflictError("No employee record is linked to your user account");
      (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
      throw err;
    }
    employee = raw as typeof employee;
  }

  // 2. Employment status gate.
  if (!SCHEDULABLE_STATUSES.has(employee.employmentStatus)) {
    throw new ConflictError(
      `Employee with status "${employee.employmentStatus}" cannot apply for leave`,
    );
  }

  // 3. Leave type existence + active.
  const leaveType = await db.leaveType.findUnique({
    where: { id: input.leaveTypeId },
    select: {
      id: true,
      isPaid: true,
      isBalanceTracked: true,
      allowHalfDay: true,
      requiresDocument: true,
      maxConsecutiveDays: true,
      isActive: true,
    },
  });
  if (!leaveType) throw new NotFoundError("Leave type not found");
  if (!leaveType.isActive) throw new ConflictError("Leave type is inactive");

  // 4. Document requirement.
  if (leaveType.requiresDocument && !input.documentUrl) {
    throw new ValidationError("A document URL is required for this leave type");
  }

  // 5. Half-day validation (also enforced by Zod schema refine, but belt-and-suspenders).
  if (input.isHalfDay && !leaveType.allowHalfDay) {
    throw new ValidationError("This leave type does not allow half-day requests");
  }

  // 6. Overlap check: any non-terminal request for the same employee.
  const overlap = await db.leaveRequest.findFirst({
    where: {
      employeeId: employee.id,
      status: { in: ["PENDING", "APPROVED"] },
      AND: [{ startDate: { lte: input.endDate } }, { endDate: { gte: input.startDate } }],
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
  if (overlap) {
    throw new ConflictError(`Leave request overlaps with an existing ${overlap.status} request`);
  }

  // 7. Min-tenure check.
  const policy = await db.leavePolicy.findFirst({
    where: { leaveTypeId: input.leaveTypeId, tenantId: actor.tenantId, isActive: true },
    orderBy: { createdAt: "desc" },
    select: { minTenureMonths: true, entitledDaysPerYear: true },
  });
  if (policy && policy.minTenureMonths > 0) {
    const tenureMonths = monthsBetween(employee.employmentStartDate, input.startDate);
    if (tenureMonths < policy.minTenureMonths) {
      throw new ConflictError(
        `Employee must have ${policy.minTenureMonths} month(s) of tenure to apply for this leave type`,
      );
    }
  }

  // 8. Compute totalDays via computation engine.
  const totalDays = await computeLeaveDays(
    db,
    actor,
    employee.id,
    employee.storeId,
    input.startDate,
    input.endDate,
    input.isHalfDay ?? false,
  );

  if (totalDays === 0) {
    throw new ValidationError(
      "The selected date range contains no working days (all weekends or holidays)",
    );
  }

  // 9. Max consecutive days check.
  if (leaveType.maxConsecutiveDays !== null && totalDays > leaveType.maxConsecutiveDays) {
    throw new ValidationError(
      `This leave type allows at most ${leaveType.maxConsecutiveDays} consecutive days`,
    );
  }

  // 10. Balance impact.
  const balanceImpactDays = leaveType.isPaid && leaveType.isBalanceTracked ? totalDays : 0;

  // 11. Fiscal cycle year.
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: actor.tenantId },
    select: { settings: true },
  });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const fiscalStart =
    ((settings?.hr as Record<string, unknown>)?.fiscalYearStartMonth as number) ?? 1;
  const cycleYear = getCycleYear(input.startDate, fiscalStart);

  // 12. Transaction: reserve balance + create request.
  //     SERIALIZABLE + retry guards the concurrent-reservation race
  //     (deep-dive §3/§13-3) — see runBalanceTx.
  const request = await runBalanceTx(db, async (tx: TenantPrismaClient) => {
    if (balanceImpactDays > 0) {
      const balance = await tx.leaveBalance.upsert({
        where: {
          tenantId_employeeId_leaveTypeId_cycleYear: {
            tenantId: actor.tenantId,
            employeeId: employee.id,
            leaveTypeId: input.leaveTypeId,
            cycleYear,
          },
        },
        create: {
          tenantId: actor.tenantId,
          employeeId: employee.id,
          leaveTypeId: input.leaveTypeId,
          cycleYear,
          entitledDays: 0,
          usedDays: 0,
          pendingDays: 0,
          carriedDays: 0,
        },
        update: {},
        select: balanceSelect,
      });

      const available = Number(derivedAvailable(balance));
      if (available < balanceImpactDays) {
        const err = new ConflictError(
          `Insufficient leave balance. Available: ${available}, Required: ${balanceImpactDays}`,
        );
        (err as { code: string }).code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          pendingDays: new Prisma.Decimal(balance.pendingDays.toString())
            .plus(balanceImpactDays)
            .toFixed(2),
        },
      });
    }

    return tx.leaveRequest.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: employee.id,
        leaveTypeId: input.leaveTypeId,
        startDate: input.startDate,
        endDate: input.endDate,
        isHalfDay: input.isHalfDay ?? false,
        totalDays: totalDays.toFixed(2),
        balanceImpactDays: balanceImpactDays.toFixed(2),
        reason: input.reason ?? null,
        documentUrl: input.documentUrl ?? null,
        status: "PENDING",
      },
      select: requestSelect,
    });
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_REQUEST_CREATED",
    entityType: "LeaveRequest",
    entityId: request.id,
    newData: request,
  });

  // Alert the approvers — HR + managers + admins — that a request awaits them.
  void notifyRoles(actor.tenantId, [Role.HR_MANAGER, Role.MANAGER, Role.ADMIN], {
    type: NotificationType.LEAVE,
    title: "New leave request",
    body: `A leave request for ${request.totalDays} day(s) is pending approval.`,
    link: `/hr/leave/requests/${request.id}`,
    data: { leaveRequestId: request.id, employeeId: request.employeeId },
  });

  return request;
}

export async function updateLeaveRequest(
  db: TenantPrismaClient,
  actor: LeaveActor,
  id: string,
  input: LeaveRequestUpdateInput,
) {
  const existing = await db.leaveRequest.findUnique({ where: { id }, select: requestSelect });
  if (!existing) throw new NotFoundError("Leave request not found");
  if (existing.status !== "PENDING") {
    throw new ConflictError("Only PENDING requests can be updated");
  }
  await requestScopeWhere(db, actor, undefined, existing.employeeId);

  const row = await db.leaveRequest.update({
    where: { id },
    data: {
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.isHalfDay !== undefined && { isHalfDay: input.isHalfDay }),
      ...(input.reason !== undefined && { reason: input.reason }),
      ...(input.documentUrl !== undefined && { documentUrl: input.documentUrl }),
    },
    select: requestSelect,
  });
  return row;
}

export async function approveLeaveRequest(
  db: TenantPrismaClient,
  actor: LeaveActor,
  id: string,
  input: LeaveDecisionInput,
) {
  const req = await db.leaveRequest.findUnique({ where: { id }, select: requestSelect });
  if (!req) throw new NotFoundError("Leave request not found");
  if (req.status !== "PENDING") {
    throw new ConflictError("Only PENDING requests can be approved");
  }

  // SoD: approver cannot approve their own request.
  const actorEmployee = await getCallerEmployee(db, actor);
  if (actorEmployee?.id === req.employeeId) {
    throw new AuthorizationError(
      "You cannot approve your own leave request (separation of duties)",
    );
  }

  // Team-scope check (ADMIN/HR_MANAGER bypass).
  if (!ALL_ROLES.has(actor.role)) {
    if (!actorEmployee) throw new AuthorizationError("Caller has no linked employee");
    const teamIds = await getTeamEmployeeIds(db, actorEmployee.id);
    if (!teamIds.includes(req.employeeId)) {
      throw new AuthorizationError("Leave request is not within your team scope");
    }
  }

  const balanceImpact = Number(req.balanceImpactDays);
  const fiscal = await getFiscalStart(db, actor.tenantId);
  const cycleYear = getCycleYear(req.startDate, fiscal);

  const updated = await runBalanceTx(db, async (tx: TenantPrismaClient) => {
    if (balanceImpact > 0) {
      const balance = await tx.leaveBalance.findUnique({
        where: {
          tenantId_employeeId_leaveTypeId_cycleYear: {
            tenantId: actor.tenantId,
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            cycleYear,
          },
        },
        select: balanceSelect,
      });
      if (!balance)
        throw new ConflictError("No leave balance record found for this employee/type/year");

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: {
          usedDays: new Prisma.Decimal(balance.usedDays.toString()).plus(balanceImpact).toFixed(2),
          pendingDays: new Prisma.Decimal(balance.pendingDays.toString())
            .minus(balanceImpact)
            .toFixed(2),
        },
      });
    }

    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approverId: actor.id,
        decidedAt: new Date(),
        decisionNotes: input.decisionNotes ?? null,
      },
      select: requestSelect,
    });
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_REQUEST_APPROVED",
    entityType: "LeaveRequest",
    entityId: id,
    oldData: req,
    newData: updated,
  });

  // The "New leave request" alert fanned out to every approver
  // (HR/MANAGER/ADMIN) is now stale — the request has a decision. Clear it
  // for all of them so a lingering unread badge doesn't survive re-login.
  void resolveNotificationsForEntity(actor.tenantId, "leaveRequestId", id, {
    type: NotificationType.LEAVE,
  });

  // Let the requesting employee know the outcome in real time.
  void notifyLeaveEmployee(db, actor.tenantId, req.employeeId, {
    type: NotificationType.LEAVE,
    title: "Leave request approved",
    body: `Your leave request for ${updated.totalDays} day(s) was approved.`,
    link: `/me/leave`,
    data: { leaveRequestId: id, status: "APPROVED" },
  });

  return updated;
}

export async function rejectLeaveRequest(
  db: TenantPrismaClient,
  actor: LeaveActor,
  id: string,
  input: LeaveDecisionInput,
) {
  const req = await db.leaveRequest.findUnique({ where: { id }, select: requestSelect });
  if (!req) throw new NotFoundError("Leave request not found");
  if (req.status !== "PENDING") {
    throw new ConflictError("Only PENDING requests can be rejected");
  }

  // SoD + team scope.
  const actorEmployee = await getCallerEmployee(db, actor);
  if (actorEmployee?.id === req.employeeId) {
    throw new AuthorizationError("You cannot reject your own leave request");
  }
  if (!ALL_ROLES.has(actor.role)) {
    if (!actorEmployee) throw new AuthorizationError("Caller has no linked employee");
    const teamIds = await getTeamEmployeeIds(db, actorEmployee.id);
    if (!teamIds.includes(req.employeeId)) {
      throw new AuthorizationError("Leave request is not within your team scope");
    }
  }

  const balanceImpact = Number(req.balanceImpactDays);
  const fiscal = await getFiscalStart(db, actor.tenantId);
  const cycleYear = getCycleYear(req.startDate, fiscal);

  const updated = await runBalanceTx(db, async (tx: TenantPrismaClient) => {
    if (balanceImpact > 0) {
      const balance = await tx.leaveBalance.findUnique({
        where: {
          tenantId_employeeId_leaveTypeId_cycleYear: {
            tenantId: actor.tenantId,
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            cycleYear,
          },
        },
        select: balanceSelect,
      });
      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            pendingDays: new Prisma.Decimal(balance.pendingDays.toString())
              .minus(balanceImpact)
              .toFixed(2),
          },
        });
      }
    }

    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: actor.id,
        decidedAt: new Date(),
        decisionNotes: input.decisionNotes ?? null,
      },
      select: requestSelect,
    });
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_REQUEST_REJECTED",
    entityType: "LeaveRequest",
    entityId: id,
    oldData: req,
    newData: updated,
  });

  // The pending-approval alert fanned out to every approver is now stale —
  // clear it for all of them (see approveLeaveRequest for rationale).
  void resolveNotificationsForEntity(actor.tenantId, "leaveRequestId", id, {
    type: NotificationType.LEAVE,
  });

  // Let the requesting employee know the outcome in real time.
  void notifyLeaveEmployee(db, actor.tenantId, req.employeeId, {
    type: NotificationType.LEAVE,
    title: "Leave request rejected",
    body: `Your leave request for ${updated.totalDays} day(s) was rejected.`,
    link: `/me/leave`,
    data: { leaveRequestId: id, status: "REJECTED" },
  });

  return updated;
}

export async function cancelLeaveRequest(db: TenantPrismaClient, actor: LeaveActor, id: string) {
  const req = await db.leaveRequest.findUnique({ where: { id }, select: requestSelect });
  if (!req) throw new NotFoundError("Leave request not found");

  const callerEmployee = await getCallerEmployee(db, actor);
  const isOwner = callerEmployee?.id === req.employeeId;

  // Only owner (or ADMIN/HR_MANAGER) can cancel.
  if (!isOwner && !ALL_ROLES.has(actor.role)) {
    throw new AuthorizationError("Only the requester or an admin can cancel a leave request");
  }

  const balanceImpact = Number(req.balanceImpactDays);
  const fiscal = await getFiscalStart(db, actor.tenantId);
  const cycleYear = getCycleYear(req.startDate, fiscal);

  let newStatus: "CANCELLED" | "CANCELLED_POST";

  if (req.status === "PENDING") {
    newStatus = "CANCELLED";
  } else if (req.status === "APPROVED") {
    const now = new Date();
    const startUtc = new Date(req.startDate);
    // Cancel-after-approve only allowed if start date is in the future.
    if (startUtc <= now) {
      throw new ConflictError(
        "Cannot cancel an approved leave request after its start date (the leave has been consumed)",
      );
    }
    newStatus = "CANCELLED_POST";
  } else {
    throw new ConflictError(`Cannot cancel a leave request with status "${req.status}"`);
  }

  const updated = await runBalanceTx(db, async (tx: TenantPrismaClient) => {
    if (balanceImpact > 0) {
      const balance = await tx.leaveBalance.findUnique({
        where: {
          tenantId_employeeId_leaveTypeId_cycleYear: {
            tenantId: actor.tenantId,
            employeeId: req.employeeId,
            leaveTypeId: req.leaveTypeId,
            cycleYear,
          },
        },
        select: balanceSelect,
      });
      if (balance) {
        if (newStatus === "CANCELLED") {
          // Release reservation.
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              pendingDays: new Prisma.Decimal(balance.pendingDays.toString())
                .minus(balanceImpact)
                .toFixed(2),
            },
          });
        } else {
          // CANCELLED_POST: refund from usedDays.
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: new Prisma.Decimal(balance.usedDays.toString())
                .minus(balanceImpact)
                .toFixed(2),
            },
          });
        }
      }
    }

    return tx.leaveRequest.update({
      where: { id },
      data: { status: newStatus },
      select: requestSelect,
    });
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEAVE_REQUEST_CANCELLED",
    entityType: "LeaveRequest",
    entityId: id,
    oldData: req,
    newData: updated,
  });

  // A withdrawn request is no longer actionable — clear the pending-approval
  // alert from every approver's inbox so the badge doesn't linger.
  void resolveNotificationsForEntity(actor.tenantId, "leaveRequestId", id, {
    type: NotificationType.LEAVE,
  });

  return updated;
}

// ─── Frozen contracts (consumed by attendance & payroll) ───────────────────────

/**
 * Returns whether the employee has an APPROVED leave request covering the
 * given local date (YYYY-MM-DD). Attendance derivation calls this to
 * classify a day as ON_LEAVE instead of ABSENT without mutating immutable
 * attendance records.
 */
export async function isOnApprovedLeave(
  db: TenantPrismaClient,
  _actor: LeaveActor,
  employeeId: string,
  localDateIso: string,
): Promise<IsOnApprovedLeaveResult> {
  const date = new Date(localDateIso + "T00:00:00.000Z");
  const req = await db.leaveRequest.findFirst({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: date },
      endDate: { gte: date },
    },
    include: {
      leaveType: { select: { id: true, isPaid: true } },
    },
  });
  if (!req) return { onLeave: false };
  return {
    onLeave: true,
    leaveTypeId: req.leaveTypeId,
    isPaid: (req.leaveType as { isPaid: boolean }).isPaid,
    isHalfDay: req.isHalfDay,
  };
}

/**
 * Returns a breakdown of paid vs unpaid leave days for an employee over a
 * period. Payroll calls this to compute deduction lines.
 */
export async function getPaidUnpaidLeaveDays(
  db: TenantPrismaClient,
  _actor: LeaveActor,
  employeeId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<PaidUnpaidLeaveDaysResult> {
  const requests = await db.leaveRequest.findMany({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    include: {
      leaveType: { select: { id: true, name: true, isPaid: true } },
    },
  });

  const byType = new Map<string, { name: string; isPaid: boolean; days: number }>();
  for (const req of requests) {
    const lt = req.leaveType as { id: string; name: string; isPaid: boolean };
    const current = byType.get(lt.id) ?? { name: lt.name, isPaid: lt.isPaid, days: 0 };
    current.days += Number(req.totalDays);
    byType.set(lt.id, current);
  }

  let paidDays = 0;
  let unpaidDays = 0;
  const byTypeArr: PaidUnpaidLeaveDaysResult["byType"] = [];

  for (const [leaveTypeId, info] of byType) {
    byTypeArr.push({ leaveTypeId, leaveTypeName: info.name, isPaid: info.isPaid, days: info.days });
    if (info.isPaid) paidDays += info.days;
    else unpaidDays += info.days;
  }

  return { paidDays, unpaidDays, byType: byTypeArr };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function getFiscalStart(db: TenantPrismaClient, tenantId: string): Promise<number> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  return ((settings?.hr as Record<string, unknown>)?.fiscalYearStartMonth as number) ?? 1;
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}
