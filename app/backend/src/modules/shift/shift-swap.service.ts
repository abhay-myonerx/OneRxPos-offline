// HRM Shift Swap workflow Per
// docs/v2/hrm-deep-dives/3.hrm-shifts.md §10.
//
// State machine:
//
//   PENDING_PEER ──peer accepts──▶ PENDING_MANAGER ──manager approves──▶ APPROVED
//        │                              │
//        │ peer rejects                 │ manager rejects
//        ▼                              ▼
//     REJECTED                       REJECTED
//   PENDING_PEER ──requester cancels──▶ CANCELLED
//   PENDING_*    ──expiresAt elapsed (job)──▶ EXPIRED   ← daily job, deferred
//
// Approval atomically swaps the workShiftId + planned* snapshot between
// the two ShiftSchedule rows (or transfers requester's schedule to the
// counterpart if it's a give-away — counterpartScheduleId null). The
// underlying ShiftSchedule rows keep their (tenantId, employeeId,
// scheduledDate) identity; only their template/snapshot moves. Audit
// captures the before/after.

import type { TenantPrismaClient } from "../../config/database";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";

import type { Actor } from "./shift.service";
import type {
  SwapApproveInput,
  SwapListInput,
  SwapRequestCreateInput,
  SwapRespondInput,
} from "./shift.validation";

const TEAM_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MANAGER", "HR_MANAGER"]);
const ALL_VIEW_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "HR_MANAGER"]);

const DEFAULT_SWAP_EXPIRY_HOURS = 48;

interface SchedSnapshot {
  id: string;
  employeeId: string;
  status: string;
  workShiftId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedBreakMinutes: number;
  plannedGraceMinutes: number;
  isOffDay: boolean;
  storeId: string | null;
}

const swapSelect = {
  id: true,
  tenantId: true,
  requesterEmployeeId: true,
  requesterScheduleId: true,
  counterpartEmployeeId: true,
  counterpartScheduleId: true,
  reason: true,
  status: true,
  peerRespondedAt: true,
  managerUserId: true,
  managerRespondedAt: true,
  decisionNotes: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function callerEmployee(
  db: TenantPrismaClient,
  actor: Actor,
): Promise<{ id: string; reportsToId: string | null } | null> {
  return (await db.employee.findFirst({
    where: { userId: actor.id },
    select: { id: true, reportsToId: true },
  })) as { id: string; reportsToId: string | null } | null;
}

// ─── Create (requestSwap) ──────────────────────────────────────────────────────

export async function requestSwap(
  db: TenantPrismaClient,
  actor: Actor,
  input: SwapRequestCreateInput,
) {
  const caller = await callerEmployee(db, actor);
  if (!caller) {
    const err = new ConflictError(
      "No employee record is linked to this user. Ask HR to link your profile.",
    );
    (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
    throw err;
  }

  // Requester schedule must belong to caller and be in the future.
  const reqSched = (await db.shiftSchedule.findUnique({
    where: { id: input.requesterScheduleId },
    select: {
      id: true,
      employeeId: true,
      status: true,
      scheduledDate: true,
    },
  })) as { id: string; employeeId: string; status: string; scheduledDate: Date } | null;
  if (!reqSched) {
    throw new NotFoundError("ShiftSchedule", input.requesterScheduleId);
  }
  if (reqSched.employeeId !== caller.id) {
    throw new AuthorizationError("You can only request a swap on your own schedule");
  }
  if (reqSched.status !== "SCHEDULED") {
    throw new ConflictError(
      `Requester schedule is ${reqSched.status}; only SCHEDULED rows can be swapped`,
    );
  }
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  if (reqSched.scheduledDate < todayStart) {
    throw new ValidationError("Swap requests must be for a future scheduled date");
  }

  if (input.counterpartEmployeeId === caller.id) {
    throw new ValidationError("Counterpart must be a different employee");
  }

  // Counterpart employee must be active in same tenant.
  const counterpart = (await db.employee.findUnique({
    where: { id: input.counterpartEmployeeId },
    select: { id: true, employmentStatus: true, isActive: true },
  })) as { id: string; employmentStatus: string; isActive: boolean } | null;
  if (!counterpart) {
    throw new NotFoundError("Employee", input.counterpartEmployeeId);
  }
  if (!counterpart.isActive || counterpart.employmentStatus === "TERMINATED") {
    throw new ConflictError("Counterpart employee is not active");
  }

  // If counterpartScheduleId provided, validate it belongs to counterpart.
  if (input.counterpartScheduleId) {
    const cpSched = (await db.shiftSchedule.findUnique({
      where: { id: input.counterpartScheduleId },
      select: {
        id: true,
        employeeId: true,
        status: true,
        scheduledDate: true,
      },
    })) as {
      id: string;
      employeeId: string;
      status: string;
      scheduledDate: Date;
    } | null;
    if (!cpSched) {
      throw new NotFoundError("ShiftSchedule", input.counterpartScheduleId);
    }
    if (cpSched.employeeId !== counterpart.id) {
      throw new ValidationError("counterpartScheduleId does not belong to counterpartEmployeeId");
    }
    if (cpSched.status !== "SCHEDULED") {
      throw new ConflictError(
        `Counterpart schedule is ${cpSched.status}; only SCHEDULED rows can be swapped`,
      );
    }
    if (cpSched.scheduledDate < todayStart) {
      throw new ValidationError("Counterpart schedule must be in the future");
    }
  }

  // Block if a non-terminal swap already exists on either schedule.
  const existingOpen = await db.shiftSwapRequest.findFirst({
    where: {
      status: { in: ["PENDING_PEER", "PENDING_MANAGER"] as never },
      OR: [
        { requesterScheduleId: input.requesterScheduleId },
        { counterpartScheduleId: input.requesterScheduleId },
        ...(input.counterpartScheduleId
          ? [
              {
                requesterScheduleId: input.counterpartScheduleId,
              },
              {
                counterpartScheduleId: input.counterpartScheduleId,
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  if (existingOpen) {
    const err = new ConflictError(
      "A non-terminal swap already exists for one of the involved schedules",
    );
    (err as { code: string }).code = "SWAP_ALREADY_PENDING";
    throw err;
  }

  const expiresAt = new Date(Date.now() + DEFAULT_SWAP_EXPIRY_HOURS * 60 * 60 * 1000);

  const row = await db.shiftSwapRequest.create({
    data: {
      tenantId: actor.tenantId,
      requesterEmployeeId: caller.id,
      requesterScheduleId: input.requesterScheduleId,
      counterpartEmployeeId: input.counterpartEmployeeId,
      counterpartScheduleId: input.counterpartScheduleId ?? null,
      reason: input.reason ?? null,
      status: "PENDING_PEER" as never,
      expiresAt,
    },
    select: swapSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SHIFT_SWAP_REQUESTED",
    entityType: "ShiftSwapRequest",
    entityId: row.id,
    newData: row,
  });
  return row;
}

// ─── respondPeer ───────────────────────────────────────────────────────────────

export async function respondPeer(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: SwapRespondInput,
) {
  const swap = (await db.shiftSwapRequest.findUnique({
    where: { id },
    select: swapSelect,
  })) as
    | (Record<string, unknown> & {
        id: string;
        counterpartEmployeeId: string;
        status: string;
        expiresAt: Date;
      })
    | null;
  if (!swap) throw new NotFoundError("ShiftSwapRequest", id);

  const caller = await callerEmployee(db, actor);
  if (!caller || caller.id !== swap.counterpartEmployeeId) {
    throw new AuthorizationError("Only the counterpart can respond to this swap");
  }
  if (swap.status !== "PENDING_PEER") {
    throw new ConflictError(`Swap is ${swap.status}; cannot record a peer response`);
  }
  if (swap.expiresAt < new Date()) {
    throw new ConflictError("Swap has expired; please ask the requester to re-submit");
  }

  const nextStatus = input.accept ? "PENDING_MANAGER" : "REJECTED";
  const updated = await db.shiftSwapRequest.update({
    where: { id },
    data: {
      status: nextStatus as never,
      peerRespondedAt: new Date(),
    },
    select: swapSelect,
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: input.accept ? "SHIFT_SWAP_PEER_ACCEPTED" : "SHIFT_SWAP_PEER_REJECTED",
    entityType: "ShiftSwapRequest",
    entityId: id,
    oldData: swap,
    newData: updated,
  });
  return updated;
}

// ─── approveManager / rejectManager ────────────────────────────────────────────

async function isWithinManagerScope(
  db: TenantPrismaClient,
  actor: Actor,
  requesterEmployeeId: string,
  counterpartEmployeeId: string,
): Promise<boolean> {
  if (ALL_VIEW_ROLES.has(actor.role)) return true;
  if (!TEAM_VIEW_ROLES.has(actor.role)) return false;
  const caller = await callerEmployee(db, actor);
  if (!caller) return false;
  // Both employees must be within caller's team (shared "team" scope
  // from attendance — §10.2 step 1).
  const both = (await db.employee.findMany({
    where: { id: { in: [requesterEmployeeId, counterpartEmployeeId] } },
    select: { id: true, reportsToId: true },
  })) as Array<{ id: string; reportsToId: string | null }>;
  if (both.length < 2) return false;
  return both.every((e) => e.reportsToId === caller.id || e.id === caller.id);
}

export async function approveManager(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: SwapApproveInput,
) {
  const swap = (await db.shiftSwapRequest.findUnique({
    where: { id },
    select: swapSelect,
  })) as
    | (Record<string, unknown> & {
        id: string;
        status: string;
        expiresAt: Date;
        requesterEmployeeId: string;
        counterpartEmployeeId: string;
        requesterScheduleId: string;
        counterpartScheduleId: string | null;
      })
    | null;
  if (!swap) throw new NotFoundError("ShiftSwapRequest", id);
  if (swap.status !== "PENDING_MANAGER") {
    throw new ConflictError(
      `Swap is ${swap.status}; only PENDING_MANAGER swaps can be approved/rejected by a manager`,
    );
  }
  if (swap.expiresAt < new Date()) {
    throw new ConflictError("Swap has expired; please ask the requester to re-submit");
  }

  const inScope = await isWithinManagerScope(
    db,
    actor,
    swap.requesterEmployeeId,
    swap.counterpartEmployeeId,
  );
  if (!inScope) {
    throw new AuthorizationError("Both employees in the swap must be within your team scope");
  }

  if (!input.approve) {
    const rejected = await db.shiftSwapRequest.update({
      where: { id },
      data: {
        status: "REJECTED" as never,
        managerUserId: actor.id,
        managerRespondedAt: new Date(),
        decisionNotes: input.decisionNotes ?? null,
      },
      select: swapSelect,
    });
    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "SHIFT_SWAP_REJECTED",
      entityType: "ShiftSwapRequest",
      entityId: id,
      oldData: swap,
      newData: rejected,
    });
    return { swap: rejected, schedules: null };
  }

  // Approve: atomically swap (or transfer for give-aways) and update audit.
  const requesterSched = (await db.shiftSchedule.findUnique({
    where: { id: swap.requesterScheduleId },
    select: {
      id: true,
      employeeId: true,
      status: true,
      workShiftId: true,
      plannedStart: true,
      plannedEnd: true,
      plannedBreakMinutes: true,
      plannedGraceMinutes: true,
      isOffDay: true,
      storeId: true,
    },
  })) as {
    id: string;
    employeeId: string;
    status: string;
    workShiftId: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    plannedBreakMinutes: number;
    plannedGraceMinutes: number;
    isOffDay: boolean;
    storeId: string | null;
  } | null;
  if (!requesterSched) {
    throw new NotFoundError("ShiftSchedule", swap.requesterScheduleId);
  }
  if (requesterSched.status !== "SCHEDULED") {
    throw new ConflictError(
      `Requester schedule is ${requesterSched.status} and can no longer be swapped`,
    );
  }

  let counterpartSched: SchedSnapshot | null = null;

  if (swap.counterpartScheduleId) {
    counterpartSched = (await db.shiftSchedule.findUnique({
      where: { id: swap.counterpartScheduleId },
      select: {
        id: true,
        employeeId: true,
        status: true,
        workShiftId: true,
        plannedStart: true,
        plannedEnd: true,
        plannedBreakMinutes: true,
        plannedGraceMinutes: true,
        isOffDay: true,
        storeId: true,
      },
    })) as SchedSnapshot | null;
    if (!counterpartSched) {
      throw new NotFoundError("ShiftSchedule", swap.counterpartScheduleId);
    }
    if (counterpartSched.status !== "SCHEDULED") {
      throw new ConflictError(
        `Counterpart schedule is ${counterpartSched.status} and can no longer be swapped`,
      );
    }
  }

  const updated = await db.$transaction(async (tx) => {
    if (counterpartSched) {
      // Two-sided swap: exchange the template + snapshot between the
      // two rows. Each row's (employeeId, scheduledDate) identity
      // stays put — only the *assignment* moves.
      await tx.shiftSchedule.update({
        where: { id: requesterSched.id },
        data: {
          workShiftId: counterpartSched.workShiftId,
          plannedStart: counterpartSched.plannedStart,
          plannedEnd: counterpartSched.plannedEnd,
          plannedBreakMinutes: counterpartSched.plannedBreakMinutes,
          plannedGraceMinutes: counterpartSched.plannedGraceMinutes,
          isOffDay: counterpartSched.isOffDay,
          storeId: counterpartSched.storeId,
          status: "SCHEDULED" as never,
        },
      });
      await tx.shiftSchedule.update({
        where: { id: counterpartSched.id },
        data: {
          workShiftId: requesterSched.workShiftId,
          plannedStart: requesterSched.plannedStart,
          plannedEnd: requesterSched.plannedEnd,
          plannedBreakMinutes: requesterSched.plannedBreakMinutes,
          plannedGraceMinutes: requesterSched.plannedGraceMinutes,
          isOffDay: requesterSched.isOffDay,
          storeId: requesterSched.storeId,
          status: "SCHEDULED" as never,
        },
      });
    } else {
      // Give-away: requester's schedule becomes the counterpart's
      // schedule (no return). Requester is left unrostered for the
      // date (no row); the original row is reassigned by changing
      // its `employeeId` — preserves audit and the date uniqueness
      // for the new owner.
      //
      // We mark the original row's status SWAPPED first (so the
      // audit history shows the transition) then create a NEW row
      // for the counterpart with the snapshot. That keeps each row
      // immutable in its employeeId vs swap-transferring it.
      await tx.shiftSchedule.update({
        where: { id: requesterSched.id },
        data: { status: "SWAPPED" as never },
      });
      await tx.shiftSchedule.create({
        data: {
          tenantId: actor.tenantId,
          employeeId: swap.counterpartEmployeeId,
          workShiftId: requesterSched.workShiftId,
          storeId: requesterSched.storeId,
          scheduledDate:
            (
              await tx.shiftSchedule.findUnique({
                where: { id: requesterSched.id },
                select: { scheduledDate: true },
              })
            )?.scheduledDate ?? new Date(),
          plannedStart: requesterSched.plannedStart,
          plannedEnd: requesterSched.plannedEnd,
          plannedBreakMinutes: requesterSched.plannedBreakMinutes,
          plannedGraceMinutes: requesterSched.plannedGraceMinutes,
          isOffDay: requesterSched.isOffDay,
          status: "SCHEDULED" as never,
          notes: "Created via shift swap (give-away)",
        },
      });
    }
    return await tx.shiftSwapRequest.update({
      where: { id },
      data: {
        status: "APPROVED" as never,
        managerUserId: actor.id,
        managerRespondedAt: new Date(),
        decisionNotes: input.decisionNotes ?? null,
      },
      select: swapSelect,
    });
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SHIFT_SWAP_APPROVED",
    entityType: "ShiftSwapRequest",
    entityId: id,
    oldData: { swap, requesterSched, counterpartSched },
    newData: updated,
  });
  return { swap: updated, schedules: { requesterSched, counterpartSched } };
}

// ─── Cancel (requester withdraws) ──────────────────────────────────────────────

export async function cancelOwn(db: TenantPrismaClient, actor: Actor, id: string) {
  const swap = (await db.shiftSwapRequest.findUnique({
    where: { id },
    select: swapSelect,
  })) as
    | (Record<string, unknown> & {
        id: string;
        requesterEmployeeId: string;
        status: string;
      })
    | null;
  if (!swap) throw new NotFoundError("ShiftSwapRequest", id);
  const caller = await callerEmployee(db, actor);
  if (!caller || caller.id !== swap.requesterEmployeeId) {
    throw new AuthorizationError("Only the requester can cancel this swap");
  }
  if (swap.status !== "PENDING_PEER" && swap.status !== "PENDING_MANAGER") {
    throw new ConflictError(`Swap is ${swap.status} and cannot be cancelled`);
  }
  const updated = await db.shiftSwapRequest.update({
    where: { id },
    data: { status: "CANCELLED" as never },
    select: swapSelect,
  });
  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SHIFT_SWAP_CANCELLED",
    entityType: "ShiftSwapRequest",
    entityId: id,
    oldData: swap,
    newData: updated,
  });
  return updated;
}

// ─── List / get ────────────────────────────────────────────────────────────────

export async function listSwaps(db: TenantPrismaClient, actor: Actor, params: SwapListInput) {
  const { scope, status, from, to, ...rest } = params;
  const effectiveScope = scope ?? (ALL_VIEW_ROLES.has(actor.role) ? "all" : "mine");

  let scopedWhere: Record<string, unknown> = {};
  if (effectiveScope === "all") {
    if (!ALL_VIEW_ROLES.has(actor.role)) {
      throw new AuthorizationError("Missing scope: all");
    }
    scopedWhere = {};
  } else {
    const caller = await callerEmployee(db, actor);
    if (!caller) {
      const err = new ConflictError("No employee record is linked to this user.");
      (err as { code: string }).code = "NO_LINKED_EMPLOYEE";
      throw err;
    }
    if (effectiveScope === "mine") {
      scopedWhere = { requesterEmployeeId: caller.id };
    } else if (effectiveScope === "incoming") {
      scopedWhere = {
        counterpartEmployeeId: caller.id,
        status: "PENDING_PEER" as never,
      };
    } else if (effectiveScope === "to-approve") {
      if (!TEAM_VIEW_ROLES.has(actor.role)) {
        throw new AuthorizationError("Missing scope: to-approve");
      }
      // Pending-manager swaps where caller's team contains both employees.
      const teamIds = (await db.employee.findMany({
        where: { reportsToId: caller.id },
        select: { id: true },
      })) as Array<{ id: string }>;
      const team = [caller.id, ...teamIds.map((r) => r.id)];
      scopedWhere = {
        status: "PENDING_MANAGER" as never,
        requesterEmployeeId: { in: team },
        counterpartEmployeeId: { in: team },
      };
    }
  }

  const extraWhere: Record<string, unknown> = { ...scopedWhere };
  if (status) {
    // status filter intersects with the scope's status if any
    if (scopedWhere.status) {
      extraWhere.status = status;
    } else {
      extraWhere.status = status;
    }
  }
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;
    extraWhere.createdAt = dateFilter;
  }

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, { extraWhere });
  const [data, total] = await Promise.all([
    db.shiftSwapRequest.findMany({
      where,
      orderBy,
      skip,
      take,
      select: swapSelect,
    }),
    db.shiftSwapRequest.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getSwap(db: TenantPrismaClient, actor: Actor, id: string) {
  const row = (await db.shiftSwapRequest.findUnique({
    where: { id },
    select: swapSelect,
  })) as
    | (Record<string, unknown> & {
        id: string;
        requesterEmployeeId: string;
        counterpartEmployeeId: string;
      })
    | null;
  if (!row) throw new NotFoundError("ShiftSwapRequest", id);

  if (!ALL_VIEW_ROLES.has(actor.role)) {
    const caller = await callerEmployee(db, actor);
    const isParty =
      caller && (caller.id === row.requesterEmployeeId || caller.id === row.counterpartEmployeeId);
    if (!isParty && TEAM_VIEW_ROLES.has(actor.role) && caller) {
      const inScope = await isWithinManagerScope(
        db,
        actor,
        row.requesterEmployeeId,
        row.counterpartEmployeeId,
      );
      if (!inScope) {
        throw new AuthorizationError("Not allowed to view this swap");
      }
    } else if (!isParty) {
      throw new AuthorizationError("Not allowed to view this swap");
    }
  }
  return row;
}
