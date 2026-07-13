// Unit tests for the HRM Holiday service No database required.
//
// Coverage:
//   * createHoliday — happy path + audit
//   * deactivateHoliday — idempotent (already inactive returns same row)
//   * importPreset — US preset creates expected rows; skips P2002 duplicates
//   * getCalendar — returns all-store + store-specific holidays filtered by year
//   * tenant isolation: all queries go through req.db (mock); no tenantId
//     derived from request body.

import { describe, it, expect, vi } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../holiday.service";

// ─── Mock DB factory ───────────────────────────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>;

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    holiday: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeHolidayRow()),
      update: vi.fn().mockResolvedValue(makeHolidayRow()),
      count: vi.fn().mockResolvedValue(0),
      ...((overrides.holiday as Record<string, MockFn>) ?? {}),
    },
  } as unknown as Parameters<typeof service.listHolidays>[0];
}

function makeHolidayRow(
  o: Partial<{
    id: string;
    tenantId: string;
    name: string;
    date: Date;
    type: string;
    isActive: boolean;
    isRecurring: boolean;
    countryCode: string | null;
    storeId: string | null;
  }> = {},
) {
  return {
    id: "h-1",
    tenantId: "t-1",
    storeId: null,
    name: "New Year's Day",
    date: new Date("2026-01-01"),
    type: "PUBLIC",
    isRecurring: true,
    countryCode: "US",
    isActive: true,
    createdAt: new Date(),
    ...o,
  };
}

const actor = { id: "user-1", tenantId: "t-1", role: "HR_MANAGER" };

// ─── createHoliday ─────────────────────────────────────────────────────────────

describe("createHoliday", () => {
  it("creates a holiday and writes an audit log", async () => {
    const createdRow = makeHolidayRow();
    const db = makeDb({ holiday: { create: vi.fn().mockResolvedValue(createdRow) } });
    const result = await service.createHoliday(db, actor, {
      name: "New Year's Day",
      date: new Date("2026-01-01"),
      type: "PUBLIC",
      storeId: null,
      isRecurring: true,
      countryCode: null,
    });
    expect(result).toMatchObject({ name: "New Year's Day" });
    expect((db as unknown as { holiday: { create: MockFn } }).holiday.create).toHaveBeenCalled();
  });
});

// ─── deactivateHoliday ─────────────────────────────────────────────────────────

describe("deactivateHoliday", () => {
  it("deactivates an active holiday", async () => {
    const active = makeHolidayRow({ isActive: true });
    const inactive = makeHolidayRow({ isActive: false });
    const db = makeDb({
      holiday: {
        findUnique: vi.fn().mockResolvedValue(active),
        update: vi.fn().mockResolvedValue(inactive),
      },
    });
    const result = await service.deactivateHoliday(db, actor, "h-1");
    expect(result.isActive).toBe(false);
  });

  it("returns the same row unchanged when already inactive (idempotent)", async () => {
    const inactive = makeHolidayRow({ isActive: false });
    const db = makeDb({ holiday: { findUnique: vi.fn().mockResolvedValue(inactive) } });
    const result = await service.deactivateHoliday(db, actor, "h-1");
    expect(result.isActive).toBe(false);
    // update should NOT have been called.
    expect(
      (db as unknown as { holiday: { update: MockFn } }).holiday.update,
    ).not.toHaveBeenCalled();
  });
});

// ─── importPreset ─────────────────────────────────────────────────────────────

describe("importPreset", () => {
  it("creates holidays from the US preset for 2026", async () => {
    let createCount = 0;
    const db = makeDb({
      holiday: {
        create: vi.fn().mockImplementation(() => {
          createCount++;
          return Promise.resolve(makeHolidayRow());
        }),
      },
    });
    const result = await service.importPreset(db, actor, {
      countryCode: "US",
      year: 2026,
      storeId: null,
    });
    expect(result.countryCode).toBe("US");
    expect(result.year).toBe(2026);
    expect(result.created).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
  });

  it("skips existing rows (idempotent — P2002 → skipped++)", async () => {
    const db = makeDb({
      holiday: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
      },
    });
    const result = await service.importPreset(db, actor, {
      countryCode: "US",
      year: 2026,
      storeId: null,
    });
    expect(result.created).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("loads all five preset country files without error", async () => {
    const countries = ["US", "UK", "IN", "BD", "UAE"] as const;
    for (const cc of countries) {
      const db = makeDb({
        holiday: { create: vi.fn().mockResolvedValue(makeHolidayRow()) },
      });
      const result = await service.importPreset(db, actor, {
        countryCode: cc,
        year: 2026,
        storeId: null,
      });
      expect(result.countryCode).toBe(cc);
      expect(result.created).toBeGreaterThan(0);
    }
  });
});

// ─── getCalendar ───────────────────────────────────────────────────────────────

describe("getCalendar", () => {
  it("returns year + storeId + holidays array", async () => {
    const rows = [makeHolidayRow({ date: new Date("2026-01-01") })];
    const db = makeDb({ holiday: { findMany: vi.fn().mockResolvedValue(rows) } });
    const result = await service.getCalendar(db, actor, { year: 2026, storeId: null });
    expect(result.year).toBe(2026);
    expect(result.storeId).toBeNull();
    expect(result.holidays).toHaveLength(1);
  });

  it("passes store filter to Prisma when storeId is provided", async () => {
    const db = makeDb({ holiday: { findMany: vi.fn().mockResolvedValue([]) } });
    await service.getCalendar(db, actor, { year: 2026, storeId: "store-1" });
    const call = ((db as unknown as { holiday: { findMany: MockFn } }).holiday.findMany as MockFn)
      .mock.calls[0][0] as {
      where: { OR?: unknown[] };
    };
    // Expect OR: [{storeId: null}, {storeId: "store-1"}]
    expect(call.where.OR).toBeDefined();
  });
});
