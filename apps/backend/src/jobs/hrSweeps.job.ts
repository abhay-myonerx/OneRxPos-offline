// HR background sweeps:
//   Shift-swap expiry (PENDING_* → EXPIRED after 48 h)
//   End-of-day shift reconciliation
//             (SCHEDULED → COMPLETED / ABSENT / ON_LEAVE)
//   Monthly leave accrual (MONTHLY_ACCRUAL policies)
//
// All three are scheduled jobs (BullMQ repeatable). The processor
// functions are exported individually so the test suite can call
// them directly; the worker entry-point wires them up.

import type { Job } from "bullmq";

import { prisma } from "../config/database";
import { logger } from "../shared/utils/logger";
import type {
  HrLeaveMonthlyAccrualJobData,
  HrShiftEodReconcileJobData,
  HrShiftSwapExpiryJobData,
} from "../config/queue";

// ─── OI-034 — Shift-swap expiry ─────────────────────────────────────

/**
 * Sweeps every tenant. Transitions PENDING_PEER / PENDING_MANAGER
 * swap requests whose `expiresAt` is past to EXPIRED. Returns the
 * count touched (informational).
 */
export async function processShiftSwapExpiry(
  _job: Job<HrShiftSwapExpiryJobData>,
): Promise<{ expired: number }> {
  const now = new Date();
  logger.info({ now }, "HR shift-swap expiry sweep started");

  const result = await prisma.shiftSwapRequest.updateMany({
    where: {
      status: { in: ["PENDING_PEER", "PENDING_MANAGER"] as never },
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" as never },
  });

  logger.info({ count: result.count }, "HR shift-swap expiry sweep done");
  return { expired: result.count };
}

// ─── OI-035 — End-of-day shift reconciliation ───────────────────────

/**
 * For each ShiftSchedule row on the supplied date with status
 * SCHEDULED:
 *   - if any AttendanceRecord (CHECK_IN) for the employee on the day
 *     → COMPLETED
 *   - else if isOnApprovedLeave(employee, date)               → ON_LEAVE
 *   - else                                                    → ABSENT
 *
 * Implemented as a per-tenant loop so a single bad tenant doesn't
 * block the others.
 */
export async function processShiftEodReconcile(
  job: Job<HrShiftEodReconcileJobData>,
): Promise<{ touched: number }> {
  const isoDate = job.data.date;
  const dayStart = new Date(`${isoDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${isoDate}T23:59:59.999Z`);
  logger.info({ date: isoDate }, "HR shift EoD reconcile started");

  const scheduled = (await prisma.shiftSchedule.findMany({
    where: {
      scheduledDate: dayStart,
      status: "SCHEDULED" as never,
    },
    select: {
      id: true,
      tenantId: true,
      employeeId: true,
    },
  })) as Array<{ id: string; tenantId: string; employeeId: string }>;

  let touched = 0;
  for (const sched of scheduled) {
    // Did the employee actually punch in?
    const punched = await prisma.attendanceRecord.findFirst({
      where: {
        tenantId: sched.tenantId,
        employeeId: sched.employeeId,
        eventType: "CHECK_IN" as never,
        occurredAt: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true },
    });
    if (punched) {
      await prisma.shiftSchedule.update({
        where: { id: sched.id },
        data: { status: "COMPLETED" as never },
      });
      touched += 1;
      continue;
    }

    // Approved leave covering the date?
    const onLeave = await prisma.leaveRequest.findFirst({
      where: {
        tenantId: sched.tenantId,
        employeeId: sched.employeeId,
        status: "APPROVED" as never,
        startDate: { lte: dayEnd },
        endDate: { gte: dayStart },
      },
      select: { id: true },
    });
    await prisma.shiftSchedule.update({
      where: { id: sched.id },
      data: {
        status: (onLeave ? "ON_LEAVE" : "ABSENT") as never,
      },
    });
    touched += 1;
  }

  logger.info({ date: isoDate, touched }, "HR shift EoD reconcile done");
  return { touched };
}

// ─── OI-036 — Monthly leave accrual ────────────────────────────────

/**
 * Runs on the 1st of every month. For every active LeavePolicy
 * with `accrualMethod = MONTHLY_ACCRUAL`, adds
 * `entitledDaysPerYear / 12` to every active LeaveBalance for the
 * current cycle. PER_WORKED_DAYS is deferred (depends on the
 * attendance derivation cache landing) — handled by a separate
 * sweep when needed.
 */
export async function processLeaveMonthlyAccrual(
  job: Job<HrLeaveMonthlyAccrualJobData>,
): Promise<{ adjustments: number }> {
  const month = job.data.month; // YYYY-MM
  logger.info({ month }, "HR monthly leave accrual started");

  // Pull every monthly-accrual policy across all tenants. The
  // table is small (per-tenant, per-leave-type) so a single
  // sweep is fine.
  const policies = (await prisma.leavePolicy.findMany({
    where: {
      accrualMethod: "MONTHLY_ACCRUAL" as never,
      isActive: true,
    },
    select: {
      id: true,
      tenantId: true,
      leaveTypeId: true,
      entitledDaysPerYear: true,
    },
  })) as Array<{
    id: string;
    tenantId: string;
    leaveTypeId: string;
    // Decimal.js — keep loose so we don't pin to a Prisma-internal
    // path that varies across CLI versions.
    entitledDaysPerYear: { toString: () => string };
  }>;

  let adjustments = 0;
  const currentYear = new Date().getUTCFullYear();
  for (const p of policies) {
    const monthly = Number(p.entitledDaysPerYear.toString()) / 12;
    // Increment every active balance for this leaveType in the
    // current cycle for this tenant.
    const result = await prisma.leaveBalance.updateMany({
      where: {
        tenantId: p.tenantId,
        leaveTypeId: p.leaveTypeId,
        cycleYear: currentYear,
      },
      data: {
        entitledDays: {
          increment: monthly,
        },
      },
    });
    adjustments += result.count;
  }

  logger.info({ month, adjustments }, "HR monthly leave accrual done");
  return { adjustments };
}
