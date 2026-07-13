// Phase B — period-start-active salary selection (deep-dive §9.1 / edge
// case "raise effective mid-period").
//
// A raise that takes effect INSIDE the run period must not change the run:
// the salary row active on `periodStart` governs. The prior query bounded
// `effectiveFrom` by `periodEnd` and ordered desc, so a mid-period raise's
// (newer) row was wrongly selected. These tests assert the query now selects
// the period-START-active row.
//
// We assert the query SHAPE (a mocked db returns whatever it's told, so the
// only deterministic, DB-independent signal is the WHERE the service builds).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../leave/leave.service", () => ({
  getPaidUnpaidLeaveDays: vi.fn().mockResolvedValue({ paidDays: 0, unpaidDays: 0, byType: [] }),
}));

import * as service from "../payroll.service";

type MockFn = ReturnType<typeof vi.fn>;

const actor = { id: "user-1", tenantId: "tenant-1", role: "HR_MANAGER" };
const periodStart = new Date("2026-05-01T00:00:00.000Z");
const periodEnd = new Date("2026-05-31T00:00:00.000Z");

// Minimal db to drive processPayrollRun → _computeAllPayslips far enough to
// issue the salary lookup, then stop (salary === null ⇒ employee skipped).
function makeDb(salaryFindFirst: MockFn) {
  const run = {
    id: "run-1",
    tenantId: "tenant-1",
    status: "DRAFT",
    periodStart,
    periodEnd,
    storeId: null,
  };
  return {
    payrollRun: {
      findFirst: vi.fn().mockResolvedValue(run),
      findFirstOrThrow: vi.fn().mockResolvedValue({ ...run, status: "REVIEW" }),
      update: vi.fn().mockResolvedValue(run),
    },
    employee: {
      findMany: vi.fn().mockResolvedValue([{ id: "emp-1" }]),
    },
    employeeSalary: { findFirst: salaryFindFirst },
  } as unknown as Parameters<typeof service.processPayrollRun>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("payroll salary selection — period-start-active row", () => {
  it("bounds effectiveFrom by periodStart (not periodEnd) so a mid-period raise is ignored", async () => {
    const salaryFindFirst = vi.fn().mockResolvedValue(null); // skip employee
    const db = makeDb(salaryFindFirst);

    await service.processPayrollRun(db, actor, "run-1");

    expect(salaryFindFirst).toHaveBeenCalledTimes(1);
    const where = (salaryFindFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where;

    // The governing condition: row must have started on/before periodStart…
    expect(where.effectiveFrom).toEqual({ lte: periodStart });
    // …and not yet ended before periodStart.
    expect(where.OR).toEqual([{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }]);

    // Regression guard: the old bug bounded by periodEnd.
    expect((where.effectiveFrom as { lte: Date }).lte).not.toEqual(periodEnd);
  });

  it("orders by effectiveFrom desc so the latest period-start-active row wins", async () => {
    const salaryFindFirst = vi.fn().mockResolvedValue(null);
    const db = makeDb(salaryFindFirst);

    await service.processPayrollRun(db, actor, "run-1");

    const args = salaryFindFirst.mock.calls[0][0] as {
      orderBy: { effectiveFrom: string };
    };
    expect(args.orderBy).toEqual({ effectiveFrom: "desc" });
  });
});
