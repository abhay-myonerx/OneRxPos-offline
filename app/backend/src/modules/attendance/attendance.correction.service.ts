// HRM Attendance Correction service.
//
// Per docs/v2/hrm-deep-dives/2.hrm-attendance.md §10.
//
// Workflow:
//   PENDING ──approve──► APPROVED  (+ creates an immutable AttendanceRecord
//                                    with isRegularized=true)
//      │
//      ├──reject──► REJECTED
//      └──cancel(self only)──► CANCELLED
//
// The original (missing/wrong) punches are never edited per §3 (event
// log = truth). Approval ADDS a flagged record; the correction row links
// to the new record via resultingRecordId.

import type { TenantPrismaClient } from "../../config/database";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";

import type {
  CorrectionCreateInput,
  CorrectionDecisionInput,
  CorrectionListInput,
} from "./attendance.validation";
import type { Actor } from "./attendance.service";

const TEAM_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MANAGER", "HR_MANAGER"]);
const ALL_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "HR_MANAGER"]);

const DEFAULT_REGULARIZATION_WINDOW_DAYS = 7;

const correctionSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  requestedDate: true,
  eventType: true,
  requestedTime: true,
  reason: true,
  evidenceUrl: true,
  status: true,
  managerUserId: true,
  managerRespondedAt: true,
  managerNotes: true,
  resultingRecordId: true,
  createdAt: true,
  updatedAt: true,
  createdByUserId: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      reportsToId: true,
    },
  },
} as const;

async function resolveCallerEmployee(
  db: TenantPrismaClient,
  actor: Actor,
): Promise<{ id: string; reportsToId: string | null } | null> {
  const row = await db.employee.findFirst({
    where: { userId: actor.id },
    select: { id: true, reportsToId: true },
  });
  return row;
}

async function assertWithinApprovalScope(
  db: TenantPrismaClient,
  actor: Actor,
  targetEmployeeId: string,
): Promise<void> {
  if (ALL_VIEW_ROLES.has(actor.role)) return;
  if (!TEAM_VIEW_ROLES.has(actor.role)) {
    throw new AuthorizationError("Role is not permitted to act on corrections");
  }
  const caller = await resolveCallerEmployee(db, actor);
  if (!caller) throw new AuthorizationError("Caller has no linked employee");
  const target = await db.employee.findUnique({
    where: { id: targetEmployeeId },
    select: { reportsToId: true },
  });
  if (!target || target.reportsToId !== caller.id) {
    throw new AuthorizationError("Target employee is not in your approval scope");
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function request(db: TenantPrismaClient, actor: Actor, input: CorrectionCreateInput) {
  // The route layer authorizes self vs `request.for.others` separately.
  // Self path: input.employeeId is null/undefined → resolve from userId.
  let employeeId: string;
  if (!input.employeeId) {
    const me = await resolveCallerEmployee(db, actor);
    if (!me) {
      const err = new ConflictError(
        "No employee record is linked to this user. Ask HR to link your profile.",
      );
      (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
      throw err;
    }
    employeeId = me.id;
  } else {
    // Manager/HR creating on behalf of an employee — out of self-scope.
    // Permission gating is at the route layer; tenant scoping via db.
    const exists = await db.employee.findUnique({
      where: { id: input.employeeId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError("Employee", input.employeeId);
    employeeId = exists.id;
  }

  // §10.3 time-box: regularization window (default 7 days). Only HR
  // bypasses (`requestForOthers` permission, enforced at routes).
  const windowDays = DEFAULT_REGULARIZATION_WINDOW_DAYS;
  const now = new Date();
  const oldest = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  if (input.requestedDate < oldest && !ALL_VIEW_ROLES.has(actor.role)) {
    const err = new ValidationError(
      `Corrections must be requested within ${windowDays} days. Older entries require HR backdated entry.`,
    );
    (err as { code: string }).code = "REGULARIZATION_WINDOW_EXCEEDED";
    throw err;
  }

  const row = await db.attendanceCorrection.create({
    data: {
      tenantId: actor.tenantId,
      employeeId,
      requestedDate: input.requestedDate,
      eventType: input.eventType as never,
      requestedTime: input.requestedTime,
      reason: input.reason,
      evidenceUrl: input.evidenceUrl ?? null,
      status: "PENDING",
      createdByUserId: actor.id,
    },
    select: correctionSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "ATTENDANCE_CORRECTION_REQUESTED",
    entityType: "AttendanceCorrection",
    entityId: row.id,
    newData: row,
  });

  return row;
}

// ─── List / get ────────────────────────────────────────────────────────────────

export async function list(db: TenantPrismaClient, actor: Actor, params: CorrectionListInput) {
  const { scope, employeeId, from, to, ...rest } = params;

  let scopedWhere: Record<string, unknown> = {};
  const effectiveScope = scope ?? (ALL_VIEW_ROLES.has(actor.role) ? "all" : "self");
  if (effectiveScope === "all") {
    if (!ALL_VIEW_ROLES.has(actor.role)) {
      throw new AuthorizationError("Missing scope: all");
    }
    scopedWhere = {};
  } else if (effectiveScope === "team") {
    if (!TEAM_VIEW_ROLES.has(actor.role)) {
      throw new AuthorizationError("Missing scope: team");
    }
    if (ALL_VIEW_ROLES.has(actor.role)) scopedWhere = {};
    else {
      const caller = await resolveCallerEmployee(db, actor);
      if (!caller) throw new AuthorizationError("Caller has no linked employee");
      const reports = (await db.employee.findMany({
        where: { reportsToId: caller.id },
        select: { id: true },
      })) as Array<{ id: string }>;
      scopedWhere = {
        employeeId: { in: [caller.id, ...reports.map((r) => r.id)] },
      };
    }
  } else {
    const caller = await resolveCallerEmployee(db, actor);
    if (!caller) {
      const err = new ConflictError(
        "No employee record is linked to this user. Ask HR to link your profile.",
      );
      (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
      throw err;
    }
    scopedWhere = { employeeId: caller.id };
  }
  if (employeeId) {
    // Tighten further if specifically requested. Authorization above
    // already restricts the set.
    if ("employeeId" in scopedWhere && typeof scopedWhere.employeeId === "object") {
      // intersect manually below by adding AND
      scopedWhere = {
        AND: [scopedWhere, { employeeId }],
      };
    } else {
      scopedWhere = { ...scopedWhere, employeeId };
    }
  }
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;
  const extraWhere: Record<string, unknown> = { ...scopedWhere };
  if (from || to) extraWhere.requestedDate = dateFilter;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, { extraWhere });
  const [data, total] = await Promise.all([
    db.attendanceCorrection.findMany({
      where,
      orderBy,
      skip,
      take,
      select: correctionSelect,
    }),
    db.attendanceCorrection.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getById(db: TenantPrismaClient, actor: Actor, id: string) {
  const row = (await db.attendanceCorrection.findUnique({
    where: { id },
    select: correctionSelect,
  })) as {
    id: string;
    employeeId: string;
    employee: { reportsToId: string | null };
  } | null;
  if (!row) throw new NotFoundError("AttendanceCorrection", id);

  if (!ALL_VIEW_ROLES.has(actor.role)) {
    const caller = await resolveCallerEmployee(db, actor);
    const isSelf = caller?.id === row.employeeId;
    const isTeam =
      caller && TEAM_VIEW_ROLES.has(actor.role) && row.employee.reportsToId === caller.id;
    if (!isSelf && !isTeam) {
      throw new AuthorizationError("Not allowed to view this correction");
    }
  }
  return row;
}

// ─── Approve / reject / cancel ─────────────────────────────────────────────────

export async function approve(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  decision: CorrectionDecisionInput,
) {
  const existing = (await db.attendanceCorrection.findUnique({
    where: { id },
    select: correctionSelect,
  })) as {
    id: string;
    employeeId: string;
    employee: { reportsToId: string | null };
    status: string;
    requestedTime: Date;
    eventType: string;
    requestedDate: Date;
  } | null;
  if (!existing) throw new NotFoundError("AttendanceCorrection", id);
  if (existing.status !== "PENDING") {
    throw new ConflictError(`Correction is already ${existing.status} and cannot be approved`);
  }
  await assertWithinApprovalScope(db, actor, existing.employeeId);

  const newRecord = await db.attendanceRecord.create({
    data: {
      tenantId: actor.tenantId,
      employeeId: existing.employeeId,
      eventType: existing.eventType as never,
      occurredAt: existing.requestedTime,
      method: "MANUAL" as never,
      isRegularized: true,
      correctionId: existing.id,
      createdByUserId: actor.id,
      notes: `Regularization for ${existing.requestedDate.toISOString().slice(0, 10)}`,
    },
  });

  const updated = await db.attendanceCorrection.update({
    where: { id },
    data: {
      status: "APPROVED" as never,
      managerUserId: actor.id,
      managerRespondedAt: new Date(),
      managerNotes: decision.managerNotes ?? null,
      resultingRecordId: newRecord.id,
    },
    select: correctionSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "ATTENDANCE_CORRECTION_APPROVED",
    entityType: "AttendanceCorrection",
    entityId: id,
    oldData: existing,
    newData: { ...updated, resultingRecord: newRecord },
  });

  return { correction: updated, record: newRecord };
}

export async function reject(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  decision: CorrectionDecisionInput,
) {
  const existing = (await db.attendanceCorrection.findUnique({
    where: { id },
    select: correctionSelect,
  })) as {
    id: string;
    employeeId: string;
    employee: { reportsToId: string | null };
    status: string;
  } | null;
  if (!existing) throw new NotFoundError("AttendanceCorrection", id);
  if (existing.status !== "PENDING") {
    throw new ConflictError(`Correction is already ${existing.status} and cannot be rejected`);
  }
  await assertWithinApprovalScope(db, actor, existing.employeeId);

  const updated = await db.attendanceCorrection.update({
    where: { id },
    data: {
      status: "REJECTED" as never,
      managerUserId: actor.id,
      managerRespondedAt: new Date(),
      managerNotes: decision.managerNotes ?? null,
    },
    select: correctionSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "ATTENDANCE_CORRECTION_REJECTED",
    entityType: "AttendanceCorrection",
    entityId: id,
    oldData: existing,
    newData: updated,
  });

  return updated;
}

export async function cancelOwn(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = (await db.attendanceCorrection.findUnique({
    where: { id },
    select: correctionSelect,
  })) as { id: string; employeeId: string; status: string } | null;
  if (!existing) throw new NotFoundError("AttendanceCorrection", id);
  if (existing.status !== "PENDING") {
    throw new ConflictError(`Correction is already ${existing.status} and cannot be cancelled`);
  }
  const caller = await resolveCallerEmployee(db, actor);
  if (!caller || caller.id !== existing.employeeId) {
    throw new AuthorizationError("Only the requesting employee can cancel a pending correction");
  }
  const updated = await db.attendanceCorrection.update({
    where: { id },
    data: {
      status: "CANCELLED" as never,
    },
    select: correctionSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "ATTENDANCE_CORRECTION_CANCELLED",
    entityType: "AttendanceCorrection",
    entityId: id,
    oldData: existing,
    newData: updated,
  });
  return updated;
}
