// Pure leave-day computation engine // Per docs/v2/hrm-deep-dives/4.hrm-leave.md §8.
//
// Algorithm:
//   for each date D in [startDate .. endDate]:
//     isWorkingDay = resolveScheduledShift(ctx, employeeId, D) non-null & !isOffDay
//                   ELSE D's weekday ∈ Tenant.settings.hr.workWeekDays
//     skip if NOT isWorkingDay
//     skip if isHoliday(tenant, storeId, D)
//     days += 1
//   if isHalfDay: days = days * 0.5
//   return Decimal(days)
//
// NOTE: `resolveScheduledShift` is imported from the shifts module.
// If no schedule is present for the employee+date the function returns
// null and the fallback to workWeekDays fires (graceful degradation,
// identical to attendance §9.2 fallback).

import type { TenantPrismaClient } from "../../config/database";
import { resolveScheduledShift } from "../shift/shift.service";
import type { LeaveActor } from "./leave.types";

// Day-of-week constants: JS Date.getDay() Mon=1..Sun=0.
const DAY_NAME_TO_JS: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Default work week if Tenant.settings.hr.workWeekDays is absent.
const DEFAULT_WORK_DAYS = new Set([1, 2, 3, 4, 5]); // Mon–Fri

function getWorkDaySet(settings: Record<string, unknown>): Set<number> {
  const hr = settings?.hr as Record<string, unknown> | undefined;
  const raw = hr?.workWeekDays;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_WORK_DAYS;
  const set = new Set<number>();
  for (const d of raw as unknown[]) {
    const n =
      typeof d === "number"
        ? d
        : typeof d === "string"
          ? (DAY_NAME_TO_JS[d.toUpperCase()] ?? DAY_NAME_TO_JS[d.toLowerCase()] ?? -1)
          : -1;
    if (n >= 0 && n <= 6) set.add(n);
  }
  return set.size > 0 ? set : DEFAULT_WORK_DAYS;
}

function dateToLocalIso(d: Date): string {
  // Returns YYYY-MM-DD treating the Date as UTC (since all leave dates are
  // stored as DATE at midnight UTC).
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Check whether a date is a holiday for the tenant (and optionally store). */
export async function isHoliday(
  db: TenantPrismaClient,
  localDateIso: string,
  storeId: string | null | undefined,
): Promise<boolean> {
  const date = new Date(localDateIso + "T00:00:00.000Z");
  const count = await db.holiday.count({
    where: {
      date,
      isActive: true,
      OR: [{ storeId: null }, ...(storeId ? [{ storeId }] : [])],
    },
  });
  return count > 0;
}

/**
 * Compute the number of leave days for a date range, excluding weekends and
 * holidays; halved for a half-day single-day request.
 *
 * Returns a JavaScript number with at most 2 decimal places.
 */
export async function computeLeaveDays(
  db: TenantPrismaClient,
  actor: LeaveActor,
  employeeId: string,
  employeeStoreId: string | null | undefined,
  startDate: Date,
  endDate: Date,
  isHalfDay: boolean,
): Promise<number> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: actor.tenantId },
    select: { settings: true },
  });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const workDays = getWorkDaySet(settings);

  let days = 0;
  let cursor = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()),
  );

  while (cursor <= end) {
    const localIso = dateToLocalIso(cursor);

    // Determine working day via shift roster (may return null gracefully).
    const resolved = await resolveScheduledShift(
      db,
      actor as Parameters<typeof resolveScheduledShift>[1],
      employeeId,
      cursor,
    );

    let isWorkingDay: boolean;
    if (resolved !== null) {
      // Roster exists: it's a working day unless explicitly off.
      isWorkingDay = !resolved.isOffDay;
    } else {
      // No roster: fall back to work-week setting.
      isWorkingDay = workDays.has(cursor.getUTCDay());
    }

    if (isWorkingDay && !(await isHoliday(db, localIso, employeeStoreId))) {
      days += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return isHalfDay ? days * 0.5 : days;
}

/**
 * Derive the fiscal cycle year for a given date.
 * Uses `Tenant.settings.hr.fiscalYearStartMonth` (1-based, default 1 = Jan).
 */
export function getCycleYear(date: Date, fiscalYearStartMonth: number): number {
  const month = date.getUTCMonth() + 1; // 1-based
  const year = date.getUTCFullYear();
  if (fiscalYearStartMonth <= 1) return year;
  // If we are before the fiscal start month this year, we are in the cycle
  // that started in the previous year.
  return month >= fiscalYearStartMonth ? year : year - 1;
}
