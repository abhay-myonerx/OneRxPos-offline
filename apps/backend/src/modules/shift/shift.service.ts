// HRM Shifts service //
// Owns:
//   * `WorkShift` template CRUD (templates are mutable but FUTURE-effective
//     only — historic `ShiftSchedule` snapshots are never rewritten).
//   * `ShiftSchedule` bulk create + per-row update / delete.
//   * `resolveScheduledShift(ctx, employeeId, localDate)` — the FROZEN
//     contract attendance derivation consumes (deep-dive §2 + §8.3).
//
// The peer-accept → manager-approve swap workflow lives in
// `shift-swap.service.ts`.
//
// Per docs/v2/hrm-deep-dives/3.hrm-shifts.md:
//   §3 — template vs scheduled-instance, snapshot rule
//   §4 — `CashierShift` is NOT a `WorkShift`; do not touch it here
//   §8 — service logic for createTemplate / createSchedule / resolve
//   §11 — invariants (one shift/day, snapshot, soft-delete via isActive,
//         only ACTIVE/PROBATION schedulable, etc.)
//
// Out-of-scope for this MVP (deferred to follow-ups, tracked in
// OPEN_ITEMS):
//   * End-of-day reconciliation job (status → COMPLETED/ABSENT/ON_LEAVE).
//   * Time-box expiry job for stale swaps (delegated to job runner).
//   * Updating attendance derivation to consume `resolveScheduledShift`
//     across the existing `getSummary` read path (additive — derivation
//     engine already accepts a `shifts` map). The contract IS published;
//     wiring through the existing call sites is deferred to avoid
//     reshaping Phase 7 reads.

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
  ScheduleBulkCreateInput,
  ScheduleListInput,
  ScheduleUpdateInput,
  WorkShiftCreateInput,
  WorkShiftListInput,
  WorkShiftUpdateInput,
} from "./shift.validation";

export interface Actor {
  id: string;
  tenantId: string;
  role: string;
}

const TEAM_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MANAGER", "HR_MANAGER"]);
const ALL_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "HR_MANAGER"]);

const SCHEDULABLE_STATUSES = new Set(["ACTIVE", "PROBATION"]);

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function callerEmployee(
  db: TenantPrismaClient,
  actor: Actor,
): Promise<{ id: string; reportsToId: string | null } | null> {
  return (await db.employee.findFirst({
    where: { userId: actor.id },
    select: { id: true, reportsToId: true },
  })) as { id: string; reportsToId: string | null } | null;
}

async function teamEmployeeIds(
  db: TenantPrismaClient,
  callerEmployeeId: string,
): Promise<string[]> {
  const rows = (await db.employee.findMany({
    where: { reportsToId: callerEmployeeId },
    select: { id: true },
  })) as Array<{ id: string }>;
  return [callerEmployeeId, ...rows.map((r) => r.id)];
}

/**
 * Translate a `scope=self|team|all` (or default per role) into a Prisma
 * `where` fragment matching the appropriate employeeId set. Reused for
 * both ShiftSchedule list and swap-request inbox.
 */
async function scheduleScopeWhere(
  db: TenantPrismaClient,
  actor: Actor,
  requestedScope: "self" | "team" | "all" | undefined,
  explicitEmployeeId?: string,
): Promise<Record<string, unknown>> {
  if (explicitEmployeeId) {
    if (ALL_VIEW_ROLES.has(actor.role)) {
      return { employeeId: explicitEmployeeId };
    }
    const caller = await callerEmployee(db, actor);
    if (caller?.id === explicitEmployeeId) {
      return { employeeId: explicitEmployeeId };
    }
    if (TEAM_VIEW_ROLES.has(actor.role) && caller) {
      const target = (await db.employee.findUnique({
        where: { id: explicitEmployeeId },
        select: { reportsToId: true },
      })) as { reportsToId: string | null } | null;
      if (target?.reportsToId === caller.id) {
        return { employeeId: explicitEmployeeId };
      }
    }
    throw new AuthorizationError("Not allowed to view roster for that employee");
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
    const caller = await callerEmployee(db, actor);
    if (!caller) {
      throw new AuthorizationError("Caller has no linked employee");
    }
    const ids = await teamEmployeeIds(db, caller.id);
    return { employeeId: { in: ids } };
  }
  // self
  const caller = await callerEmployee(db, actor);
  if (!caller) {
    const err = new ConflictError(
      "No employee record is linked to this user. Ask HR to link your profile.",
    );
    (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
    throw err;
  }
  return { employeeId: caller.id };
}

// ─── WorkShift CRUD ────────────────────────────────────────────────────────────

const workShiftSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  name: true,
  code: true,
  startTime: true,
  endTime: true,
  breakMinutes: true,
  graceMinutes: true,
  isNightShift: true,
  nightDifferentialPct: true,
  color: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function inferNight(input: { startTime: string; endTime: string; isNightShift?: boolean }) {
  if (input.isNightShift !== undefined) return input.isNightShift;
  // Cross-midnight (endTime < startTime by lexicographic HH:mm
  // comparison) auto-flips to night.
  return input.endTime < input.startTime;
}

export async function listTemplates(
  db: TenantPrismaClient,
  actor: Actor,
  params: WorkShiftListInput,
) {
  const { storeId, isActive, isNightShift, ...rest } = params as never as {
    storeId?: string;
    isActive?: boolean;
    isNightShift?: boolean;
  } & Record<string, unknown>;
  const extraWhere: Record<string, unknown> = {};
  if (storeId) extraWhere.storeId = storeId;
  if (typeof isActive === "boolean") extraWhere.isActive = isActive;
  if (typeof isNightShift === "boolean") extraWhere.isNightShift = isNightShift;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields: ["name", "code"],
    extraWhere,
  });
  const [data, total] = await Promise.all([
    db.workShift.findMany({
      where,
      orderBy,
      skip,
      take,
      select: workShiftSelect,
    }),
    db.workShift.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
  // actor unused but kept for parity with other list services that
  // gate by scope.
  void actor;
}

export async function getTemplateById(db: TenantPrismaClient, _actor: Actor, id: string) {
  const row = await db.workShift.findUnique({
    where: { id },
    select: workShiftSelect,
  });
  if (!row) throw new NotFoundError("WorkShift", id);
  return row;
}

export async function createTemplate(
  db: TenantPrismaClient,
  actor: Actor,
  input: WorkShiftCreateInput,
) {
  // Tenant uniqueness on (tenantId, code) is the DB invariant; pre-flight
  // for a friendly 409 before relying on the unique-violation path.
  const existing = await db.workShift.findFirst({
    where: { code: input.code },
    select: { id: true },
  });
  if (existing) {
    throw new ConflictError(
      `A work shift with code "${input.code}" already exists for this tenant`,
    );
  }
  if (input.storeId) {
    const store = await db.store.findUnique({
      where: { id: input.storeId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError("Store", input.storeId);
  }
  const isNight = inferNight(input);
  const row = await db.workShift.create({
    data: {
      tenantId: actor.tenantId,
      storeId: input.storeId ?? null,
      name: input.name,
      code: input.code,
      startTime: input.startTime,
      endTime: input.endTime,
      breakMinutes: input.breakMinutes,
      graceMinutes: input.graceMinutes,
      isNightShift: isNight,
      nightDifferentialPct: (input.nightDifferentialPct ?? null) as never,
      color: input.color ?? null,
      isActive: true,
    },
    select: workShiftSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "WORKSHIFT_CREATED",
    entityType: "WorkShift",
    entityId: row.id,
    newData: row,
  });
  return row;
}

export async function updateTemplate(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: WorkShiftUpdateInput,
) {
  const before = await db.workShift.findUnique({
    where: { id },
    select: workShiftSelect,
  });
  if (!before) throw new NotFoundError("WorkShift", id);

  if (input.code && input.code !== before.code) {
    const dup = await db.workShift.findFirst({
      where: { code: input.code, NOT: { id } },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictError(
        `A work shift with code "${input.code}" already exists for this tenant`,
      );
    }
  }
  if (input.storeId) {
    const store = await db.store.findUnique({
      where: { id: input.storeId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError("Store", input.storeId);
  }

  const nextStart = input.startTime ?? before.startTime;
  const nextEnd = input.endTime ?? before.endTime;
  const isNight =
    input.isNightShift !== undefined
      ? input.isNightShift
      : input.startTime !== undefined || input.endTime !== undefined
        ? nextEnd < nextStart
        : before.isNightShift;

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.code !== undefined) data.code = input.code;
  if (input.storeId !== undefined) data.storeId = input.storeId;
  if (input.startTime !== undefined) data.startTime = input.startTime;
  if (input.endTime !== undefined) data.endTime = input.endTime;
  if (input.breakMinutes !== undefined) data.breakMinutes = input.breakMinutes;
  if (input.graceMinutes !== undefined) data.graceMinutes = input.graceMinutes;
  if (input.nightDifferentialPct !== undefined)
    data.nightDifferentialPct = input.nightDifferentialPct;
  if (input.color !== undefined) data.color = input.color;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  data.isNightShift = isNight;

  const row = await db.workShift.update({
    where: { id },
    data,
    select: workShiftSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "WORKSHIFT_UPDATED",
    entityType: "WorkShift",
    entityId: row.id,
    oldData: before,
    newData: row,
  });
  return row;
}

/**
 * "Delete" a WorkShift template. Per deep-dive §11.5 a hard delete is
 * blocked when future SCHEDULED rows reference it — we then flip
 * `isActive=false` instead. Returns the updated row so the API surface
 * is consistent (no 204).
 */
export async function deactivateTemplate(db: TenantPrismaClient, actor: Actor, id: string) {
  const before = await db.workShift.findUnique({
    where: { id },
    select: workShiftSelect,
  });
  if (!before) throw new NotFoundError("WorkShift", id);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const futureScheduledCount = await db.shiftSchedule.count({
    where: {
      workShiftId: id,
      status: "SCHEDULED" as never,
      scheduledDate: { gte: today },
    },
  });
  if (futureScheduledCount > 0) {
    const err = new ConflictError(
      `Cannot delete WorkShift — ${futureScheduledCount} future scheduled rows still reference it. Either reassign those schedules or wait for them to complete.`,
    );
    (err as { code: string }).code = "SHIFT_TEMPLATE_IN_USE";
    (err as { details?: unknown }).details = { futureScheduledCount };
    throw err;
  }

  const row = await db.workShift.update({
    where: { id },
    data: { isActive: false },
    select: workShiftSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "WORKSHIFT_DEACTIVATED",
    entityType: "WorkShift",
    entityId: row.id,
    oldData: before,
    newData: row,
  });
  return row;
}

export async function reactivateTemplate(db: TenantPrismaClient, actor: Actor, id: string) {
  const before = await db.workShift.findUnique({
    where: { id },
    select: workShiftSelect,
  });
  if (!before) throw new NotFoundError("WorkShift", id);
  const row = await db.workShift.update({
    where: { id },
    data: { isActive: true },
    select: workShiftSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "WORKSHIFT_REACTIVATED",
    entityType: "WorkShift",
    entityId: row.id,
    oldData: before,
    newData: row,
  });
  return row;
}

// ─── ShiftSchedule (roster) ────────────────────────────────────────────────────

const scheduleSelect = {
  id: true,
  tenantId: true,
  employeeId: true,
  workShiftId: true,
  storeId: true,
  scheduledDate: true,
  plannedStart: true,
  plannedEnd: true,
  plannedBreakMinutes: true,
  plannedGraceMinutes: true,
  isOffDay: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  // Embed a lightweight WorkShift summary so the roster can show the
  // shift name/colour without a second lookup. (Employee has no Prisma
  // relation on ShiftSchedule — it is attached via attachEmployeeSummaries.)
  workShift: {
    select: {
      id: true,
      name: true,
      code: true,
      color: true,
      startTime: true,
      endTime: true,
    },
  },
} as const;

/**
 * ShiftSchedule has no Prisma `employee` relation (only the `employeeId`
 * scalar), so list/detail responses cannot `include` it. This helper
 * batch-loads the referenced employees once and attaches a lightweight
 * `employee` summary to each row, matching the documented API contract the
 * roster UI consumes (id, firstName, lastName, employeeCode).
 */
async function attachEmployeeSummaries<T extends { employeeId: string }>(
  db: TenantPrismaClient,
  rows: T[],
): Promise<Array<T & { employee: EmployeeSummary | null }>> {
  const ids = Array.from(new Set(rows.map((r) => r.employeeId)));
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, employee: null }));
  }
  const employees = await db.employee.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
    },
  });
  const byId = new Map<string, EmployeeSummary>(employees.map((e) => [e.id, e]));
  return rows.map((r) => ({ ...r, employee: byId.get(r.employeeId) ?? null }));
}

interface EmployeeSummary {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface BulkResult {
  created: Array<Record<string, unknown>>;
  conflicts: Array<{
    index: number;
    employeeId: string;
    scheduledDate: string;
    reason: string;
    code: string;
  }>;
}

function toDateOnly(d: Date): Date {
  // Strip TZ — store as UTC midnight so DATE column round-trips
  // consistently regardless of server timezone.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function listSchedules(
  db: TenantPrismaClient,
  actor: Actor,
  params: ScheduleListInput,
) {
  const { scope, employeeId, storeId, workShiftId, status, from, to, isOffDay, ...rest } = params;
  const accessWhere = await scheduleScopeWhere(db, actor, scope, employeeId);
  const extraWhere: Record<string, unknown> = { ...accessWhere };
  if (storeId) extraWhere.storeId = storeId;
  if (workShiftId) extraWhere.workShiftId = workShiftId;
  if (status) extraWhere.status = status;
  if (typeof isOffDay === "boolean") extraWhere.isOffDay = isOffDay;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = toDateOnly(from);
    if (to) dateFilter.lte = toDateOnly(to);
    extraWhere.scheduledDate = dateFilter;
  }

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, { extraWhere });
  const [data, total] = await Promise.all([
    db.shiftSchedule.findMany({
      where,
      orderBy,
      skip,
      take,
      select: scheduleSelect,
    }),
    db.shiftSchedule.count({ where }),
  ]);
  const enriched = await attachEmployeeSummaries(db, data);
  return formatListResponse(enriched, total, meta);
}

/**
 * Bulk roster create. Per §8.2:
 *   1) Load referenced WorkShifts once.
 *   2) For each entry resolve the Employee + validate status.
 *   3) Inside ONE transaction:
 *        - Snapshot the template's planned* fields.
 *        - Upsert on (tenantId, employeeId, scheduledDate). SCHEDULED rows
 *          can be overwritten when `overrideExisting=true`, CANCELLED rows
 *          can always be overwritten, COMPLETED/ON_LEAVE rows are
 *          immutable (do not rewrite history).
 *        - Collect created vs conflicts.
 *   4) One summary audit entry.
 */
export async function createBulkSchedule(
  db: TenantPrismaClient,
  actor: Actor,
  input: ScheduleBulkCreateInput,
): Promise<BulkResult> {
  const out: BulkResult = { created: [], conflicts: [] };

  // 1. Load referenced templates once
  const templateIds = Array.from(
    new Set(input.entries.map((e) => e.workShiftId).filter((v): v is string => !!v)),
  );
  const templates = templateIds.length
    ? ((await db.workShift.findMany({
        where: { id: { in: templateIds } },
        select: {
          id: true,
          tenantId: true,
          startTime: true,
          endTime: true,
          breakMinutes: true,
          graceMinutes: true,
          isActive: true,
        },
      })) as Array<{
        id: string;
        tenantId: string;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        graceMinutes: number;
        isActive: boolean;
      }>)
    : [];
  const tplMap = new Map(templates.map((t) => [t.id, t]));

  // 2. Pre-resolve employees + dedupe within request
  const employeeIds = Array.from(new Set(input.entries.map((e) => e.employeeId)));
  const employees = (await db.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, employmentStatus: true, isActive: true, storeId: true },
  })) as Array<{
    id: string;
    employmentStatus: string;
    isActive: boolean;
    storeId: string | null;
  }>;
  const empMap = new Map(employees.map((e) => [e.id, e]));

  const inRequestSeen = new Set<string>();

  // 3. Transactional per-row apply
  await db.$transaction(async (tx) => {
    for (let i = 0; i < input.entries.length; i += 1) {
      const entry = input.entries[i]!;
      const date = toDateOnly(entry.scheduledDate);
      const reqKey = `${entry.employeeId}:${date.toISOString().slice(0, 10)}`;

      if (inRequestSeen.has(reqKey)) {
        out.conflicts.push({
          index: i,
          employeeId: entry.employeeId,
          scheduledDate: date.toISOString().slice(0, 10),
          reason: "Duplicate (employee, date) in the same request",
          code: "DUPLICATE_IN_REQUEST",
        });
        continue;
      }
      inRequestSeen.add(reqKey);

      const emp = empMap.get(entry.employeeId);
      if (!emp) {
        out.conflicts.push({
          index: i,
          employeeId: entry.employeeId,
          scheduledDate: date.toISOString().slice(0, 10),
          reason: "Employee not found in this tenant",
          code: "EMPLOYEE_NOT_FOUND",
        });
        continue;
      }
      if (!emp.isActive || !SCHEDULABLE_STATUSES.has(emp.employmentStatus)) {
        out.conflicts.push({
          index: i,
          employeeId: entry.employeeId,
          scheduledDate: date.toISOString().slice(0, 10),
          reason: `Employee status "${emp.employmentStatus}" is not schedulable`,
          code: "EMPLOYEE_NOT_SCHEDULABLE",
        });
        continue;
      }

      // Build planned* snapshot
      let plannedStart: string | null = null;
      let plannedEnd: string | null = null;
      let plannedBreakMinutes = 0;
      let plannedGraceMinutes = 0;
      if (entry.workShiftId && !entry.isOffDay) {
        const tpl = tplMap.get(entry.workShiftId);
        if (!tpl) {
          out.conflicts.push({
            index: i,
            employeeId: entry.employeeId,
            scheduledDate: date.toISOString().slice(0, 10),
            reason: `WorkShift ${entry.workShiftId} not found in this tenant`,
            code: "WORK_SHIFT_NOT_FOUND",
          });
          continue;
        }
        if (!tpl.isActive) {
          out.conflicts.push({
            index: i,
            employeeId: entry.employeeId,
            scheduledDate: date.toISOString().slice(0, 10),
            reason: `WorkShift ${entry.workShiftId} is inactive`,
            code: "WORK_SHIFT_INACTIVE",
          });
          continue;
        }
        plannedStart = tpl.startTime;
        plannedEnd = tpl.endTime;
        plannedBreakMinutes = tpl.breakMinutes;
        plannedGraceMinutes = tpl.graceMinutes;
      }

      // Pre-existing row check
      const existing = (await tx.shiftSchedule.findFirst({
        where: {
          employeeId: entry.employeeId,
          scheduledDate: date,
        },
        select: { id: true, status: true },
      })) as { id: string; status: string } | null;

      const dateStr = date.toISOString().slice(0, 10);

      if (existing) {
        // COMPLETED / ON_LEAVE are historic and must never be rewritten.
        if (existing.status === "COMPLETED" || existing.status === "ON_LEAVE") {
          out.conflicts.push({
            index: i,
            employeeId: entry.employeeId,
            scheduledDate: dateStr,
            reason: `Existing schedule is ${existing.status}; cannot rewrite history`,
            code: "SCHEDULE_LOCKED",
          });
          continue;
        }
        // SCHEDULED → overwrite only when overrideExisting=true; otherwise conflict.
        if (existing.status === "SCHEDULED" && !input.overrideExisting) {
          out.conflicts.push({
            index: i,
            employeeId: entry.employeeId,
            scheduledDate: dateStr,
            reason: "Schedule already exists for this date (use overrideExisting=true to replace)",
            code: "SCHEDULE_ALREADY_EXISTS",
          });
          continue;
        }
        // CANCELLED / SWAPPED / ABSENT → allow overwrite (the row is no
        // longer the source of truth for "what they were assigned").
        const updated = await tx.shiftSchedule.update({
          where: { id: existing.id },
          data: {
            workShiftId: entry.isOffDay ? null : (entry.workShiftId ?? null),
            storeId: entry.storeId ?? emp.storeId,
            plannedStart,
            plannedEnd,
            plannedBreakMinutes,
            plannedGraceMinutes,
            isOffDay: entry.isOffDay ?? false,
            status: "SCHEDULED" as never,
            notes: entry.notes ?? null,
          },
          select: scheduleSelect,
        });
        out.created.push(updated);
        continue;
      }

      // Fresh row
      const created = await tx.shiftSchedule.create({
        data: {
          tenantId: actor.tenantId,
          employeeId: entry.employeeId,
          workShiftId: entry.isOffDay ? null : (entry.workShiftId ?? null),
          storeId: entry.storeId ?? emp.storeId,
          scheduledDate: date,
          plannedStart,
          plannedEnd,
          plannedBreakMinutes,
          plannedGraceMinutes,
          isOffDay: entry.isOffDay ?? false,
          status: "SCHEDULED" as never,
          notes: entry.notes ?? null,
        },
        select: scheduleSelect,
      });
      out.created.push(created);
    }
  });

  if (out.created.length > 0) {
    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "SHIFT_SCHEDULE_BULK_CREATED",
      entityType: "ShiftSchedule",
      entityId: actor.tenantId, // batch-level
      newData: {
        createdCount: out.created.length,
        conflictCount: out.conflicts.length,
        createdIds: out.created.map((r) => (r as { id: string }).id),
        overrideExisting: !!input.overrideExisting,
      },
    });
  }

  return out;
}

export async function updateSchedule(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: ScheduleUpdateInput,
) {
  const before = (await db.shiftSchedule.findUnique({
    where: { id },
    select: scheduleSelect,
  })) as
    | (Record<string, unknown> & {
        id: string;
        status: string;
        workShiftId: string | null;
        isOffDay: boolean;
        plannedStart: string | null;
        plannedEnd: string | null;
      })
    | null;
  if (!before) throw new NotFoundError("ShiftSchedule", id);
  if (before.status === "COMPLETED" || before.status === "ON_LEAVE") {
    throw new ConflictError(
      `Schedule is ${before.status} and cannot be edited (immutable history per §3.2)`,
    );
  }

  const data: Record<string, unknown> = {};
  if (input.scheduledDate !== undefined) {
    data.scheduledDate = toDateOnly(input.scheduledDate);
  }
  if (input.storeId !== undefined) data.storeId = input.storeId;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.status !== undefined) data.status = input.status;

  // Re-snapshot if workShiftId changes (or isOffDay toggled).
  let plannedSnapshotChanged = false;
  if (input.workShiftId !== undefined || input.isOffDay !== undefined) {
    const newOff = input.isOffDay ?? before.isOffDay;
    const newWsId = input.workShiftId !== undefined ? input.workShiftId : before.workShiftId;
    if (newOff) {
      data.isOffDay = true;
      data.workShiftId = null;
      data.plannedStart = null;
      data.plannedEnd = null;
      data.plannedBreakMinutes = 0;
      data.plannedGraceMinutes = 0;
      plannedSnapshotChanged = true;
    } else {
      if (!newWsId) {
        throw new ValidationError("workShiftId is required unless isOffDay is true");
      }
      const tpl = (await db.workShift.findUnique({
        where: { id: newWsId },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          breakMinutes: true,
          graceMinutes: true,
          isActive: true,
        },
      })) as {
        id: string;
        startTime: string;
        endTime: string;
        breakMinutes: number;
        graceMinutes: number;
        isActive: boolean;
      } | null;
      if (!tpl) throw new NotFoundError("WorkShift", newWsId);
      if (!tpl.isActive) {
        throw new ConflictError(`WorkShift ${newWsId} is inactive`);
      }
      data.isOffDay = false;
      data.workShiftId = newWsId;
      data.plannedStart = tpl.startTime;
      data.plannedEnd = tpl.endTime;
      data.plannedBreakMinutes = tpl.breakMinutes;
      data.plannedGraceMinutes = tpl.graceMinutes;
      plannedSnapshotChanged = true;
    }
  }

  const row = await db.shiftSchedule.update({
    where: { id },
    data,
    select: scheduleSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SHIFT_SCHEDULE_UPDATED",
    entityType: "ShiftSchedule",
    entityId: id,
    oldData: before,
    newData: { ...row, plannedSnapshotChanged },
  });
  return row;
}

/**
 * "Delete" means CANCELLED for a SCHEDULED row. We do not hard-delete
 * because audit + reporting depend on the trail. Historic statuses
 * (COMPLETED/ON_LEAVE) are immutable and return a 409.
 */
export async function cancelSchedule(db: TenantPrismaClient, actor: Actor, id: string) {
  const before = (await db.shiftSchedule.findUnique({
    where: { id },
    select: scheduleSelect,
  })) as (Record<string, unknown> & { id: string; status: string }) | null;
  if (!before) throw new NotFoundError("ShiftSchedule", id);
  if (before.status === "COMPLETED" || before.status === "ON_LEAVE") {
    throw new ConflictError(
      `Schedule is ${before.status} and cannot be deleted (immutable history per §3.2)`,
    );
  }
  const row = await db.shiftSchedule.update({
    where: { id },
    data: { status: "CANCELLED" as never },
    select: scheduleSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SHIFT_SCHEDULE_DELETED",
    entityType: "ShiftSchedule",
    entityId: id,
    oldData: before,
    newData: row,
  });
  return row;
}

// ─── resolveScheduledShift — FROZEN contract (§2 + §8.3) ───────────────────────

export interface ResolvedShift {
  scheduleId: string;
  workShiftId: string | null;
  isOffDay: boolean;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number;
  graceMinutes: number;
  crossesMidnight: boolean;
}

/**
 * The published contract attendance derivation consumes. SIGNATURE IS FROZEN.
 *
 *   null        → no schedule on this date (attendance keeps degrading
 *                 exactly as pre-shifts; this is the additive-correctness
 *                 proof per §13 "moduleEnabled === false")
 *   isOffDay    → returned with startTime/endTime null
 *   CANCELLED   → null (treated as no schedule)
 *   otherwise   → snapshot fields, NEVER a live `WorkShift` join. Payroll
 *                 integrity depends on the snapshot (§3.3).
 */
export async function resolveScheduledShift(
  db: TenantPrismaClient,
  _actor: Actor | null,
  employeeId: string,
  localDate: Date,
): Promise<ResolvedShift | null> {
  const date = toDateOnly(localDate);
  const row = (await db.shiftSchedule.findFirst({
    where: { employeeId, scheduledDate: date },
    select: {
      id: true,
      workShiftId: true,
      isOffDay: true,
      plannedStart: true,
      plannedEnd: true,
      plannedBreakMinutes: true,
      plannedGraceMinutes: true,
      status: true,
    },
  })) as {
    id: string;
    workShiftId: string | null;
    isOffDay: boolean;
    plannedStart: string | null;
    plannedEnd: string | null;
    plannedBreakMinutes: number;
    plannedGraceMinutes: number;
    status: string;
  } | null;
  if (!row) return null;
  if (row.status === "CANCELLED") return null;
  if (row.isOffDay) {
    return {
      scheduleId: row.id,
      workShiftId: null,
      isOffDay: true,
      startTime: null,
      endTime: null,
      breakMinutes: 0,
      graceMinutes: 0,
      crossesMidnight: false,
    };
  }
  return {
    scheduleId: row.id,
    workShiftId: row.workShiftId,
    isOffDay: false,
    startTime: row.plannedStart,
    endTime: row.plannedEnd,
    breakMinutes: row.plannedBreakMinutes,
    graceMinutes: row.plannedGraceMinutes,
    crossesMidnight: !!row.plannedEnd && !!row.plannedStart && row.plannedEnd < row.plannedStart,
  };
}
