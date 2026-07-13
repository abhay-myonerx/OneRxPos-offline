// HRM Attendance service.
//
// Owns:
//   * punch creation for the four CheckEventType values (self + manual)
//   * list / today / detail / employee history / summary reads
//
// Correction workflow lives in `attendance.correction.service.ts` so the
// punch service stays focused.
//
// Per docs/v2/hrm-deep-dives/2.hrm-attendance.md:
//   §8.1 punch flow
//   §13 invariants (immutable, server-decided method, log-not-block on
//        sequence anomalies, 409 NO_LINKED_EMPLOYEE, blocked statuses,
//        tenant scoping)
//
// Out-of-scope for this MVP (tracked in OPEN_ITEMS OI-028..OI-032):
//   * BiometricDevice + BiometricEnrollment + webhook auth
//   * Geofence/IP whitelist/QR token enforcement (the validator accepts
//     the input shape but does not verify against Store columns yet)
//   * Socket emissions and Redis cache invalidation
//   * Shift-aware derivation and holiday/leave overlap (graceful
//     degradation already in attendance.derivation.ts)

import type { TenantPrismaClient } from "../../config/database";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";

import {
  buildDateList,
  deriveCurrentStatus,
  deriveRange,
  type DerivationEvent,
} from "./attendance.derivation";
import { enforceAttendanceMethod, type StoreGeoConfig } from "./attendance.methods";
import { invalidateForPunch } from "./attendance.cache";
import { emitAttendanceEvent, punchEventTypeToSocketEvent } from "../../socket/attendance.handler";
import type { ListAttendanceInput, PunchInput, SummaryQueryInput } from "./attendance.validation";

export interface Actor {
  id: string;
  tenantId: string;
  role: string;
}

export const PUNCH_EVENT_TYPES = {
  CHECK_IN: "CHECK_IN",
  CHECK_OUT: "CHECK_OUT",
  BREAK_START: "BREAK_START",
  BREAK_END: "BREAK_END",
} as const;
export type PunchEventType = (typeof PUNCH_EVENT_TYPES)[keyof typeof PUNCH_EVENT_TYPES];

const TEAM_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MANAGER", "HR_MANAGER"]);

const ALL_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "HR_MANAGER"]);

const BLOCKING_EMPLOYMENT_STATUSES = new Set([
  "TERMINATED",
  "RESIGNED",
  "SUSPENDED",
  "RETIRED",
  "DECEASED",
  "CONTRACT_ENDED",
  "INACTIVE",
]);

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface ResolvedEmployee {
  id: string;
  storeId: string | null;
  employmentStatus: string;
  isActive: boolean;
  reportsToId: string | null;
  // Included so the Socket.IO emission can ship a
  // friendly name without a follow-up query.
  firstName: string;
  lastName: string;
}

/**
 * Resolve `the employee being acted on` for a punch.
 *   * `targetEmployeeId == null` → resolve "me" via Employee.userId.
 *     If no Employee row exists for this user we throw a 409 — never 500.
 *   * `targetEmployeeId != null` → load by id and require the actor to
 *     hold the manual-punch permission (route layer has already checked).
 *
 * The route layer is responsible for permission gating; this service
 * enforces tenant scoping (via `db`) and the active-employment rule.
 */
export async function resolveTargetEmployee(
  db: TenantPrismaClient,
  actor: Actor,
  targetEmployeeId?: string | null,
): Promise<{ employee: ResolvedEmployee; isSelf: boolean }> {
  if (!targetEmployeeId) {
    const me = (await db.employee.findFirst({
      where: { userId: actor.id },
      select: {
        id: true,
        storeId: true,
        employmentStatus: true,
        isActive: true,
        reportsToId: true,
        firstName: true,
        lastName: true,
      },
    })) as ResolvedEmployee | null;
    if (!me) {
      const err = new ConflictError(
        "No employee record is linked to this user. Ask HR to link your profile.",
      );
      // Custom code per §15 ("NO_LINKED_EMPLOYEE") so the API
      // contract stays explicit. ConflictError is the closest 4xx
      // family — frontends can check error.code.
      (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
      throw err;
    }
    return { employee: me, isSelf: true };
  }

  const target = (await db.employee.findUnique({
    where: { id: targetEmployeeId },
    select: {
      id: true,
      storeId: true,
      employmentStatus: true,
      isActive: true,
      reportsToId: true,
      firstName: true,
      lastName: true,
    },
  })) as ResolvedEmployee | null;
  if (!target) throw new NotFoundError("Employee", targetEmployeeId);

  // If the resolved target happens to be the caller's own employee, treat
  // as self — the manual-permission gate at the route would otherwise
  // force MANUAL on a self punch.
  const callerEmp = await db.employee.findFirst({
    where: { userId: actor.id },
    select: { id: true },
  });
  const isSelf = callerEmp?.id === target.id;
  return { employee: target, isSelf };
}

function assertEmployable(employee: ResolvedEmployee): void {
  if (!employee.isActive) {
    const err = new ValidationError("Employee is inactive — punches are blocked");
    (err as { code: string }).code = "EMPLOYEE_NOT_ACTIVE";
    throw err;
  }
  if (BLOCKING_EMPLOYMENT_STATUSES.has(employee.employmentStatus)) {
    const err = new ValidationError(
      `Employees in status "${employee.employmentStatus}" cannot punch`,
    );
    (err as { code: string }).code = "EMPLOYEE_NOT_ACTIVE";
    throw err;
  }
}

// ─── Punch ─────────────────────────────────────────────────────────────────────

export async function punch(
  db: TenantPrismaClient,
  actor: Actor,
  eventType: PunchEventType,
  input: PunchInput,
  requestMeta: { ipAddress?: string | null } = {},
) {
  const { employee, isSelf } = await resolveTargetEmployee(db, actor, input.employeeId);
  assertEmployable(employee);

  // Per §13 rule 3: a manual punch for someone else FORCES method=MANUAL.
  // For self-service, accept the submitted method; default WEB.
  const method = isSelf ? (input.method ?? "WEB") : "MANUAL";

  // Server-side enforce GEOFENCE / IP_RESTRICTED /
  // QR_CODE methods against the employee's assigned store. WEB /
  // MANUAL / BIOMETRIC are client-claim. Skipped when the employee
  // has no store assignment (the validator would have nothing to
  // anchor against and we don't want to block manual-punch flows
  // for off-store employees — those default to WEB/MANUAL).
  if (employee.storeId && method !== "WEB" && method !== "MANUAL") {
    const store = (await db.store.findUnique({
      where: { id: employee.storeId },
      select: {
        geoLat: true,
        geoLng: true,
        geoRadiusM: true,
        ipWhitelist: true,
        attendanceMethods: true,
      },
    })) as StoreGeoConfig | null;
    if (store) {
      enforceAttendanceMethod(
        { method, geo: input.geo, qrToken: input.qrToken ?? null },
        actor.tenantId,
        employee.storeId,
        store,
        { ipAddress: requestMeta.ipAddress ?? null },
      );
    }
  }

  const occurredAt = input.occurredAt ?? new Date();

  // Per §13 rule 4: sequence anomalies are LOGGED, not blocked. We still
  // compute a friendly warning string for the response, but never throw.
  const recent = (await db.attendanceRecord.findMany({
    where: {
      employeeId: employee.id,
      occurredAt: {
        gte: new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000),
        lte: occurredAt,
      },
    },
    orderBy: { occurredAt: "desc" },
    take: 10,
    select: { eventType: true, occurredAt: true },
  })) as Array<{ eventType: string; occurredAt: Date }>;
  const lastEvent = recent[0];

  const warnings: string[] = [];
  if (eventType === "CHECK_IN" && lastEvent?.eventType === "CHECK_IN") {
    warnings.push("DOUBLE_CHECK_IN");
  } else if (eventType === "CHECK_OUT" && !lastEvent) {
    warnings.push("CHECK_OUT_WITHOUT_CHECK_IN");
  } else if (
    eventType === "CHECK_OUT" &&
    lastEvent &&
    lastEvent.eventType !== "CHECK_IN" &&
    lastEvent.eventType !== "BREAK_END"
  ) {
    warnings.push("UNEXPECTED_CHECK_OUT_SEQUENCE");
  } else if (eventType === "BREAK_END" && lastEvent?.eventType !== "BREAK_START") {
    warnings.push("BREAK_END_WITHOUT_BREAK_START");
  } else if (
    eventType === "BREAK_START" &&
    lastEvent?.eventType !== "CHECK_IN" &&
    lastEvent?.eventType !== "BREAK_END"
  ) {
    warnings.push("BREAK_START_WITHOUT_CHECK_IN");
  }

  // Cheap idempotency: exact same employee+eventType+occurredAt within
  // a 1-second window is a no-op (biometric devices retry; humans can
  // double-tap). Returns the existing record without writing audit.
  const dupWindowMs = 1000;
  const dup = (await db.attendanceRecord.findFirst({
    where: {
      employeeId: employee.id,
      eventType: eventType as never,
      occurredAt: {
        gte: new Date(occurredAt.getTime() - dupWindowMs),
        lte: new Date(occurredAt.getTime() + dupWindowMs),
      },
    },
  })) as { id: string } | null;
  if (dup) {
    return {
      record: dup,
      current: await getCurrentStatus(db, employee.id),
      warnings: [...warnings, "DUPLICATE_IGNORED"],
      deduplicated: true,
    };
  }

  // Stamp `scheduledShiftId` at punch creation time if the
  // shifts module has a schedule for this employee on the punch's
  // local date. This is additive: with no schedule, the column stays
  // null (attendance derivation degrades gracefully as before).
  // Lookup is a single indexed query per §8.3 of deep-dives/3.hrm-shifts.md.
  const punchDate = new Date(
    Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()),
  );
  let scheduledShiftId: string | null = null;
  try {
    const sched = (await db.shiftSchedule.findFirst({
      where: { employeeId: employee.id, scheduledDate: punchDate },
      select: { id: true, status: true, isOffDay: true },
    })) as { id: string; status: string; isOffDay: boolean } | null;
    if (sched && sched.status !== "CANCELLED") {
      scheduledShiftId = sched.id;
    }
  } catch {
    // Shifts module not yet migrated locally — silently degrade.
    scheduledShiftId = null;
  }

  const record = await db.attendanceRecord.create({
    data: {
      tenantId: actor.tenantId,
      employeeId: employee.id,
      storeId: employee.storeId,
      scheduledShiftId,
      eventType: eventType as never,
      occurredAt,
      method: method as never,
      geoLat: input.geo?.lat as never,
      geoLng: input.geo?.lng as never,
      geoAccuracyM: input.geo?.accuracyM ?? null,
      ipAddress: requestMeta.ipAddress ?? null,
      deviceId: input.deviceId ?? null,
      photoUrl: input.photoUrl ?? null,
      notes: input.notes ?? null,
      createdByUserId: actor.id,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "ATTENDANCE_PUNCH",
    entityType: "AttendanceRecord",
    entityId: record.id,
    newData: { ...record, warnings },
    ipAddress: requestMeta.ipAddress ?? undefined,
  });

  // Invalidate the derivation cache for this employee
  // + day so the next read recomputes. Fire-and-forget; failures
  // don't block the punch.
  invalidateForPunch(actor.tenantId, employee.id, occurredAt);

  // Emit to the live attendance room. No-op
  // if the Socket.IO server hasn't been wired (unit tests, etc).
  const socketEvent = punchEventTypeToSocketEvent(eventType);
  if (socketEvent) {
    emitAttendanceEvent({
      tenantId: actor.tenantId,
      storeId: employee.storeId,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      eventType: socketEvent,
      occurredAt,
      method,
    });
  }

  return {
    record,
    current: await getCurrentStatus(db, employee.id),
    warnings,
    deduplicated: false,
  };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

const recordSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  storeId: true,
  scheduledShiftId: true,
  eventType: true,
  occurredAt: true,
  method: true,
  geoLat: true,
  geoLng: true,
  geoAccuracyM: true,
  ipAddress: true,
  deviceId: true,
  photoUrl: true,
  isRegularized: true,
  correctionId: true,
  notes: true,
  createdAt: true,
  createdByUserId: true,
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
    },
  },
} as const;

async function scopeWhere(
  db: TenantPrismaClient,
  actor: Actor,
  requestedScope: "self" | "team" | "all" | undefined,
  explicitEmployeeId?: string,
): Promise<Record<string, unknown>> {
  // If the caller passes a specific employeeId, honor it only if they
  // can see that employee under their role/scope.
  if (explicitEmployeeId) {
    if (ALL_VIEW_ROLES.has(actor.role)) {
      return { employeeId: explicitEmployeeId };
    }
    const caller = await db.employee.findFirst({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (caller?.id === explicitEmployeeId) {
      return { employeeId: explicitEmployeeId };
    }
    if (TEAM_VIEW_ROLES.has(actor.role) && caller) {
      const target = await db.employee.findUnique({
        where: { id: explicitEmployeeId },
        select: { reportsToId: true },
      });
      if (target?.reportsToId === caller.id) {
        return { employeeId: explicitEmployeeId };
      }
    }
    throw new AuthorizationError("Not allowed to view attendance for that employee");
  }

  const scope = requestedScope ?? (ALL_VIEW_ROLES.has(actor.role) ? "all" : "self");
  if (scope === "all") {
    if (!ALL_VIEW_ROLES.has(actor.role)) {
      throw new AuthorizationError("Missing scope: all");
    }
    return {};
  }
  if (scope === "team") {
    if (!TEAM_VIEW_ROLES.has(actor.role)) {
      throw new AuthorizationError("Missing scope: team");
    }
    if (ALL_VIEW_ROLES.has(actor.role)) return {};
    const caller = await db.employee.findFirst({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!caller) throw new AuthorizationError("Caller has no linked employee");
    const reports = (await db.employee.findMany({
      where: { reportsToId: caller.id },
      select: { id: true },
    })) as Array<{ id: string }>;
    return {
      employeeId: { in: [caller.id, ...reports.map((r) => r.id)] },
    };
  }
  // self
  const caller = await db.employee.findFirst({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!caller) {
    const err = new ConflictError(
      "No employee record is linked to this user. Ask HR to link your profile.",
    );
    (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
    throw err;
  }
  return { employeeId: caller.id };
}

export async function list(db: TenantPrismaClient, actor: Actor, params: ListAttendanceInput) {
  const { scope, employeeId, from, to, ...rest } = params;

  const accessWhere = await scopeWhere(db, actor, scope, employeeId);
  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.gte = from;
  if (to) dateFilter.lte = to;
  const extraWhere: Record<string, unknown> = { ...accessWhere };
  if (from || to) extraWhere.occurredAt = dateFilter;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, { extraWhere });

  const [data, total] = await Promise.all([
    db.attendanceRecord.findMany({
      where,
      orderBy,
      skip,
      take,
      select: recordSelect,
    }),
    db.attendanceRecord.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getById(db: TenantPrismaClient, actor: Actor, id: string) {
  const row = (await db.attendanceRecord.findUnique({
    where: { id },
    select: recordSelect,
  })) as { id: string; employeeId: string } | null;
  if (!row) throw new NotFoundError("AttendanceRecord", id);

  // Authorize self/team/all access on the row.
  await scopeWhere(db, actor, undefined, row.employeeId);
  return row;
}

export async function getToday(db: TenantPrismaClient, actor: Actor) {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const access = await scopeWhere(db, actor, "self", undefined);
  const where = {
    ...access,
    occurredAt: { gte: startOfDay, lt: endOfDay },
  };
  const events = (await db.attendanceRecord.findMany({
    where,
    orderBy: { occurredAt: "asc" },
    select: recordSelect,
  })) as Array<
    {
      id: string;
      eventType: string;
      occurredAt: Date;
      isRegularized: boolean;
    } & Record<string, unknown>
  >;

  const current = deriveCurrentStatus(events as unknown as DerivationEvent[]);

  return { events, current, date: startOfDay.toISOString().slice(0, 10) };
}

export async function getCurrentStatus(db: TenantPrismaClient, employeeId: string) {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const events = (await db.attendanceRecord.findMany({
    where: {
      employeeId,
      occurredAt: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) },
    },
    orderBy: { occurredAt: "asc" },
    select: { id: true, eventType: true, occurredAt: true, isRegularized: true },
  })) as DerivationEvent[];
  return deriveCurrentStatus(events);
}

/**
 * Batch-load shift schedules for a (employees × dates)
 * matrix and shape them into the `ctxByDate` map that
 * `deriveRange` consumes. Returns `Record<employeeId,
 * Record<isoDate, { shift }>>` — empty entries for dates with no
 * schedule (the derivation engine treats absence-of-shift as
 * "no expectation", which is the correct fallback).
 */
async function loadShiftContext(
  db: TenantPrismaClient,
  employeeIds: readonly string[],
  from: Date,
  to: Date,
): Promise<Record<string, Record<string, { shift: DerivationShiftLite }>>> {
  if (employeeIds.length === 0) return {};
  const rows = (await db.shiftSchedule.findMany({
    where: {
      employeeId: { in: employeeIds as string[] },
      scheduledDate: { gte: from, lte: to },
      status: { not: "CANCELLED" as never },
    },
    select: {
      employeeId: true,
      scheduledDate: true,
      isOffDay: true,
      plannedStart: true,
      plannedEnd: true,
      plannedBreakMinutes: true,
      plannedGraceMinutes: true,
    },
  })) as Array<{
    employeeId: string;
    scheduledDate: Date;
    isOffDay: boolean;
    plannedStart: string | null;
    plannedEnd: string | null;
    plannedBreakMinutes: number;
    plannedGraceMinutes: number;
  }>;

  const out: Record<string, Record<string, { shift: DerivationShiftLite }>> = {};
  for (const r of rows) {
    // Skip off-days and rows missing start/end — derivation
    // can't produce a shift-aware result from them.
    if (r.isOffDay || !r.plannedStart || !r.plannedEnd) continue;
    const iso = r.scheduledDate.toISOString().slice(0, 10);
    const perEmployee = (out[r.employeeId] ??= {});
    perEmployee[iso] = {
      shift: {
        startsAt: r.plannedStart,
        endsAt: r.plannedEnd,
        graceMinutesIn: r.plannedGraceMinutes,
      },
    };
  }
  return out;
}

interface DerivationShiftLite {
  startsAt: string;
  endsAt: string;
  graceMinutesIn?: number;
}

export async function getSummary(db: TenantPrismaClient, actor: Actor, params: SummaryQueryInput) {
  const access = await scopeWhere(db, actor, undefined, params.employeeId);

  const events = (await db.attendanceRecord.findMany({
    where: {
      ...access,
      occurredAt: { gte: params.from, lte: params.to },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      employeeId: true,
      eventType: true,
      occurredAt: true,
      isRegularized: true,
    },
  })) as Array<DerivationEvent & { employeeId: string }>;

  const dates = buildDateList(params.from, params.to);

  if (params.employeeId) {
    // Single-employee path. Load shift context for
    // just this employee + date range so late/overtime numbers
    // populate (was empty `{}` before — OI-033 close).
    const shiftMap = await loadShiftContext(db, [params.employeeId], params.from, params.to);
    const ctx = shiftMap[params.employeeId] ?? {};
    const days = deriveRange(events, ctx, dates);
    const totals = summarize(days);
    return { employeeId: params.employeeId, days, totals };
  }

  // Multi-employee summary — group by employeeId.
  const byEmployee = new Map<string, DerivationEvent[]>();
  for (const e of events) {
    const list = byEmployee.get(e.employeeId);
    if (list) list.push(e);
    else byEmployee.set(e.employeeId, [e]);
  }
  // Batch-load shifts for every employee whose
  // attendance shows up in the window. One query, indexed on
  // (employeeId, scheduledDate).
  const employeeIds = Array.from(byEmployee.keys());
  const shiftMap = await loadShiftContext(db, employeeIds, params.from, params.to);
  const employees = Array.from(byEmployee.entries()).map(([employeeId, evts]) => {
    const ctx = shiftMap[employeeId] ?? {};
    const days = deriveRange(evts, ctx, dates);
    return { employeeId, days, totals: summarize(days) };
  });
  return { employees };
}

function summarize(days: ReadonlyArray<ReturnType<typeof deriveRange>[number]>) {
  return days.reduce(
    (acc, d) => {
      acc.workedMinutes += d.workedMinutes;
      acc.lateMinutes += d.lateMinutes;
      acc.earlyLeaveMinutes += d.earlyLeaveMinutes;
      acc.overtimeMinutes += d.overtimeMinutes;
      acc.breakMinutes += d.breakMinutes;
      if (d.status === "PRESENT") acc.presentDays += 1;
      else if (d.status === "HALF_DAY") acc.halfDays += 1;
      else if (d.status === "ABSENT") acc.absentDays += 1;
      else if (d.status === "ON_LEAVE") acc.onLeaveDays += 1;
      else if (d.status === "HOLIDAY") acc.holidayDays += 1;
      else if (d.status === "WEEKEND" || d.status === "OFF") acc.offDays += 1;
      return acc;
    },
    {
      presentDays: 0,
      halfDays: 0,
      absentDays: 0,
      onLeaveDays: 0,
      holidayDays: 0,
      offDays: 0,
      workedMinutes: 0,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      breakMinutes: 0,
    },
  );
}
