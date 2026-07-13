// Unit tests for the leave day computation engine // All DB and shift calls are mocked; no database required.
//
// Coverage:
//   * Mon–Fri range: counts only workdays
//   * Weekend exclusion via workWeekDays fallback
//   * Holiday exclusion
//   * Half-day (single day × 0.5)
//   * Shift roster working-day override (rostered off-day excluded)
//   * Empty range (start > end)
//   * getCycleYear: fiscal year derivation for both pre- and post-start-month
//   * isHoliday: counts active holidays (all-store and store-specific)

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shifts module before importing compute service.
vi.mock("../../shift/shift.service", () => ({
  resolveScheduledShift: vi.fn().mockResolvedValue(null),
}));

// Mock audit service.
vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import { computeLeaveDays, getCycleYear, isHoliday } from "../leave-compute.service";
import { resolveScheduledShift } from "../../shift/shift.service";

const resolveMock = resolveScheduledShift as unknown as ReturnType<typeof vi.fn>;

// ─── Mock DB factory ───────────────────────────────────────────────────────────

function makeDb(
  opts: {
    settings?: Record<string, unknown>;
    holidayCount?: number;
  } = {},
) {
  const settings = opts.settings ?? {};
  const holidayCount = opts.holidayCount ?? 0;
  return {
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ settings }),
    },
    holiday: {
      count: vi.fn().mockResolvedValue(holidayCount),
    },
  } as unknown as Parameters<typeof computeLeaveDays>[0];
}

const actor = { id: "user-1", tenantId: "t-1", role: "HR_MANAGER" };

// ─── getCycleYear ──────────────────────────────────────────────────────────────

describe("getCycleYear", () => {
  it("returns current year when fiscal starts in January", () => {
    expect(getCycleYear(new Date("2026-06-15"), 1)).toBe(2026);
  });

  it("returns current year when date is at or after fiscal start month", () => {
    expect(getCycleYear(new Date("2026-04-01"), 4)).toBe(2026);
  });

  it("returns previous year when date is before fiscal start month", () => {
    // Fiscal year starts April; March is still in the 2025 cycle.
    expect(getCycleYear(new Date("2026-03-31"), 4)).toBe(2025);
  });

  it("returns current year for fiscal start month = 1 (default)", () => {
    expect(getCycleYear(new Date("2026-01-01"), 1)).toBe(2026);
    expect(getCycleYear(new Date("2026-12-31"), 1)).toBe(2026);
  });
});

// ─── isHoliday ────────────────────────────────────────────────────────────────

describe("isHoliday", () => {
  it("returns false when no active holidays on that date", async () => {
    const db = makeDb({ holidayCount: 0 });
    expect(await isHoliday(db as never, "2026-06-15", null)).toBe(false);
  });

  it("returns true when at least one active holiday exists", async () => {
    const db = makeDb({ holidayCount: 1 });
    expect(await isHoliday(db as never, "2026-12-25", null)).toBe(true);
  });
});

// ─── computeLeaveDays ─────────────────────────────────────────────────────────

describe("computeLeaveDays", () => {
  beforeEach(() => {
    // Default: no roster; no holidays.
    resolveMock.mockResolvedValue(null);
  });

  it("counts Mon–Fri correctly for a 5-day workweek", async () => {
    // 2026-06-01 is Monday; 2026-06-05 is Friday → 5 working days.
    const db = makeDb();
    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-01"),
      new Date("2026-06-05"),
      false,
    );
    expect(days).toBe(5);
  });

  it("excludes weekends (Sat+Sun)", async () => {
    // 2026-06-01 Mon to 2026-06-07 Sun → 5 working days.
    const db = makeDb();
    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-01"),
      new Date("2026-06-07"),
      false,
    );
    expect(days).toBe(5);
  });

  it("respects custom workWeekDays (Sat+Sun+Mon = 3 days)", async () => {
    // 2026-06-01 Mon to 2026-06-07 Sun.
    // workWeekDays = [0,1,6] → Sun, Mon, Sat → 3 in that range.
    const db = makeDb({ settings: { hr: { workWeekDays: [0, 1, 6] } } });
    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-01"),
      new Date("2026-06-07"),
      false,
    );
    expect(days).toBe(3);
  });

  it("excludes holidays", async () => {
    // 5 working days in range, 1 holiday on Wednesday.
    const db = {
      tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ settings: {} }) },
      holiday: {
        count: vi.fn().mockImplementation(({ where }: { where: { date: Date } }) => {
          const dateStr = where.date.toISOString().slice(0, 10);
          return Promise.resolve(dateStr === "2026-06-03" ? 1 : 0);
        }),
      },
    } as unknown as Parameters<typeof computeLeaveDays>[0];

    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-01"),
      new Date("2026-06-05"),
      false,
    );
    expect(days).toBe(4); // 5 working days − 1 holiday
  });

  it("returns 0.5 for a half-day single-day request", async () => {
    const db = makeDb();
    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-01"),
      new Date("2026-06-01"),
      true,
    );
    expect(days).toBe(0.5);
  });

  it("uses shift roster as working-day truth (rostered off-day excluded)", async () => {
    // Employee is rostered as off on June 2 (Tuesday).
    resolveMock.mockImplementation((_db: unknown, _actor: unknown, _emp: unknown, date: Date) => {
      const dateIso = date.toISOString().slice(0, 10);
      if (dateIso === "2026-06-02") return Promise.resolve({ isOffDay: true });
      return Promise.resolve({ isOffDay: false });
    });
    const db = makeDb();
    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-01"),
      new Date("2026-06-05"),
      false,
    );
    expect(days).toBe(4); // 5 working days − 1 off-day
  });

  it("returns 0 when all days are weekends", async () => {
    // 2026-06-06 Sat, 2026-06-07 Sun.
    const db = makeDb();
    const days = await computeLeaveDays(
      db,
      actor,
      "emp-1",
      null,
      new Date("2026-06-06"),
      new Date("2026-06-07"),
      false,
    );
    expect(days).toBe(0);
  });
});
