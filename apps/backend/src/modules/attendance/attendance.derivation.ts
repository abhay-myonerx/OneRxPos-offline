// Pure, unit-testable derivation engine for HRM attendance
// (deep-dives/2.hrm-attendance.md §9).
//
// Input: ordered events for one employee on one date + optional shift/
// holiday/leave context.
// Output: per-day derived status: workedMinutes, lateMinutes,
// overtimeMinutes, flags, etc.
//
// MVP scope: shift-aware derivation when a shift is provided (lateBy,
// earlyBy, overtime); shift-less derivation falls back to a tenant-
// configurable full-day threshold. Holiday/leave overlap inputs are
// accepted but the engine only uses them to flag status — the leave
// and shifts modules will produce the real inputs in later phases.

export type CheckEventType = "CHECK_IN" | "CHECK_OUT" | "BREAK_START" | "BREAK_END";

export type AttendanceStatus =
  "PRESENT" | "ABSENT" | "HALF_DAY" | "ON_LEAVE" | "HOLIDAY" | "WEEKEND" | "OFF";

export interface DerivationEvent {
  id: string;
  eventType: CheckEventType;
  occurredAt: Date;
  isRegularized?: boolean;
}

export interface DerivationShift {
  /** Local time string `HH:mm` */
  startsAt: string;
  /** Local time string `HH:mm` */
  endsAt: string;
  /** Minutes of grace before late kicks in. */
  graceMinutesIn?: number;
  /** Minutes of grace before early-leave kicks in. */
  graceMinutesOut?: number;
  /** Minutes past shift end before overtime accrues. */
  overtimeAfterMinutes?: number;
  /** Worked minutes considered a full attended day. */
  fullDayMinutes?: number;
  /** Worked minutes considered a half day. */
  halfDayMinutes?: number;
}

export interface DerivationContext {
  /** Date being derived, normalized to midnight UTC of the local date. */
  date: Date;
  /** Optional shift for the date. */
  shift?: DerivationShift | null;
  /**
   * True if the date is a public holiday for the employee's store.
   * Until the holiday module ships, callers leave this as false.
   */
  isHoliday?: boolean;
  /** True if an approved leave overlaps the date. */
  onLeave?: boolean;
  /** True if the date is a scheduled working day. Defaults to true. */
  isWorkingDay?: boolean;
  /**
   * Worked-minute thresholds when no shift is available — these are
   * used as the fallback for shift-less tenants.
   */
  defaultFullDayMinutes?: number;
  defaultHalfDayMinutes?: number;
}

export interface DerivedDay {
  date: string; // ISO YYYY-MM-DD
  status: AttendanceStatus;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  firstIn: Date | null;
  lastOut: Date | null;
  breakMinutes: number;
  flags: string[];
  sourceEventIds: string[];
  hasOpenSession: boolean;
}

const DEFAULT_FULL_DAY = 8 * 60;
const DEFAULT_HALF_DAY = 4 * 60;
const DEFAULT_GRACE_IN = 15;
const DEFAULT_GRACE_OUT = 0;
const DEFAULT_OT_AFTER = 0;

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseShiftBoundary(date: Date, hhmm: string): Date {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const out = new Date(date);
  out.setUTCHours(h, m, 0, 0);
  return out;
}

/**
 * Derive a per-day summary for ONE employee on ONE date. Events MUST be
 * the events for this employee on this date (caller filters them); the
 * derivation function does not re-filter.
 */
export function deriveDay(events: readonly DerivationEvent[], ctx: DerivationContext): DerivedDay {
  const dateIso = toIsoDate(ctx.date);
  const empty: DerivedDay = {
    date: dateIso,
    status: "ABSENT",
    workedMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    firstIn: null,
    lastOut: null,
    breakMinutes: 0,
    flags: [],
    sourceEventIds: [],
    hasOpenSession: false,
  };

  // 1. Holiday wins (per §9.1 step 1).
  if (ctx.isHoliday) {
    return { ...empty, status: "HOLIDAY", flags: ["HOLIDAY"] };
  }

  // 2. Approved leave wins next.
  if (ctx.onLeave) {
    return { ...empty, status: "ON_LEAVE", flags: ["ON_LEAVE"] };
  }

  // 3. Sort events defensively.
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const ids = ordered.map((e) => e.id);
  const flags: string[] = [];

  if (ordered.length === 0) {
    return {
      ...empty,
      status: ctx.isWorkingDay === false ? "OFF" : "ABSENT",
      flags: ctx.isWorkingDay === false ? ["OFF"] : ["ABSENT"],
      sourceEventIds: ids,
    };
  }

  // 4. Pair CHECK_IN/CHECK_OUT greedily.
  let openIn: Date | null = null;
  const pairs: Array<{ in: Date; out: Date }> = [];
  let firstIn: Date | null = null;
  let lastOut: Date | null = null;

  for (const e of ordered) {
    if (e.eventType === "CHECK_IN") {
      if (openIn) {
        flags.push("MULTIPLE_CHECK_INS_WITHOUT_OUT");
      }
      openIn = e.occurredAt;
      if (!firstIn) firstIn = e.occurredAt;
    } else if (e.eventType === "CHECK_OUT") {
      if (!openIn) {
        flags.push("CHECK_OUT_WITHOUT_CHECK_IN");
        continue;
      }
      pairs.push({ in: openIn, out: e.occurredAt });
      lastOut = e.occurredAt;
      openIn = null;
    }
  }
  const hasOpenSession = openIn !== null;
  if (hasOpenSession) flags.push("MISSING_CHECKOUT");

  // 5. Subtract break intervals (BREAK_START/BREAK_END).
  let openBreak: Date | null = null;
  const breakIntervals: Array<{ start: Date; end: Date }> = [];
  for (const e of ordered) {
    if (e.eventType === "BREAK_START") openBreak = e.occurredAt;
    else if (e.eventType === "BREAK_END" && openBreak) {
      breakIntervals.push({ start: openBreak, end: e.occurredAt });
      openBreak = null;
    }
  }
  if (openBreak) flags.push("MISSING_BREAK_END");

  const breakMinutes = breakIntervals.reduce(
    (acc, b) => acc + Math.max(0, (b.end.getTime() - b.start.getTime()) / 60000),
    0,
  );
  const grossMinutes = pairs.reduce(
    (acc, p) => acc + Math.max(0, (p.out.getTime() - p.in.getTime()) / 60000),
    0,
  );
  const workedMinutes = Math.round(Math.max(0, grossMinutes - breakMinutes));

  // 6. Shift-aware late / early / overtime.
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let overtimeMinutes = 0;

  const fullDayMinutes = ctx.shift?.fullDayMinutes ?? ctx.defaultFullDayMinutes ?? DEFAULT_FULL_DAY;
  const halfDayMinutes = ctx.shift?.halfDayMinutes ?? ctx.defaultHalfDayMinutes ?? DEFAULT_HALF_DAY;

  if (ctx.shift && firstIn) {
    const shiftStart = parseShiftBoundary(ctx.date, ctx.shift.startsAt);
    const shiftEnd = parseShiftBoundary(ctx.date, ctx.shift.endsAt);
    const graceIn = ctx.shift.graceMinutesIn ?? DEFAULT_GRACE_IN;
    const graceOut = ctx.shift.graceMinutesOut ?? DEFAULT_GRACE_OUT;
    const otAfter = ctx.shift.overtimeAfterMinutes ?? DEFAULT_OT_AFTER;

    const lateByMs = firstIn.getTime() - (shiftStart.getTime() + graceIn * 60000);
    if (lateByMs > 0) {
      lateMinutes = Math.round(lateByMs / 60000);
      flags.push("LATE");
    }
    if (lastOut) {
      const earlyByMs = shiftEnd.getTime() - graceOut * 60000 - lastOut.getTime();
      if (earlyByMs > 0) {
        earlyLeaveMinutes = Math.round(earlyByMs / 60000);
        flags.push("EARLY_LEAVE");
      }
      const otMs = lastOut.getTime() - shiftEnd.getTime() - otAfter * 60000;
      if (otMs > 0) {
        overtimeMinutes = Math.round(otMs / 60000);
        flags.push("OVERTIME");
      }
    }
  }

  // 7. Status from worked minutes.
  let status: AttendanceStatus;
  if (workedMinutes >= fullDayMinutes) status = "PRESENT";
  else if (workedMinutes >= halfDayMinutes) status = "HALF_DAY";
  else if (workedMinutes > 0) status = "HALF_DAY";
  else status = ctx.isWorkingDay === false ? "OFF" : "ABSENT";

  return {
    date: dateIso,
    status,
    workedMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    firstIn,
    lastOut,
    breakMinutes: Math.round(breakMinutes),
    flags,
    sourceEventIds: ids,
    hasOpenSession,
  };
}

/**
 * Group raw events into per-(employee, date) buckets and derive each.
 * The bucket date key uses UTC year/month/day from `occurredAt`.
 *
 * Used by the summary endpoint. For a single-employee summary, pass
 * pre-filtered events; for a multi-employee report, the caller groups
 * by employeeId before invoking this helper.
 */
export function deriveRange(
  events: ReadonlyArray<DerivationEvent>,
  ctxByDate: Record<string, Omit<DerivationContext, "date">>,
  dateList: readonly Date[],
): DerivedDay[] {
  const byDate = new Map<string, DerivationEvent[]>();
  for (const e of events) {
    const key = toIsoDate(e.occurredAt);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(e);
    else byDate.set(key, [e]);
  }
  return dateList.map((d) => {
    const key = toIsoDate(d);
    return deriveDay(byDate.get(key) ?? [], {
      date: d,
      ...(ctxByDate[key] ?? {}),
    });
  });
}

/** Returns the current "live" session info for an employee given today's events. */
export function deriveCurrentStatus(events: readonly DerivationEvent[]): {
  state: "CHECKED_IN" | "ON_BREAK" | "CHECKED_OUT" | "NOT_STARTED";
  sinceAt: Date | null;
  lastEventId: string | null;
} {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let state: "CHECKED_IN" | "ON_BREAK" | "CHECKED_OUT" | "NOT_STARTED" = "NOT_STARTED";
  let sinceAt: Date | null = null;
  let lastEventId: string | null = null;
  for (const e of ordered) {
    lastEventId = e.id;
    switch (e.eventType) {
      case "CHECK_IN":
        state = "CHECKED_IN";
        sinceAt = e.occurredAt;
        break;
      case "CHECK_OUT":
        state = "CHECKED_OUT";
        sinceAt = e.occurredAt;
        break;
      case "BREAK_START":
        if (state === "CHECKED_IN") {
          state = "ON_BREAK";
          sinceAt = e.occurredAt;
        }
        break;
      case "BREAK_END":
        if (state === "ON_BREAK") {
          state = "CHECKED_IN";
          sinceAt = e.occurredAt;
        }
        break;
    }
  }
  return { state, sinceAt, lastEventId };
}

/** Build a UTC date list (midnight) between `from` and `to`, inclusive. */
export function buildDateList(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur.getTime() <= end.getTime()) {
    out.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
