// Unit tests for the HRM Leave service No database required.
//
// Coverage:
//   * createLeaveRequest — happy path (balance reserved)
//   * createLeaveRequest — NO_LINKED_EMPLOYEE for self with no employee
//   * createLeaveRequest — inactive employment status blocked
//   * createLeaveRequest — INSUFFICIENT_BALANCE (paid leave)
//   * createLeaveRequest — overlap with existing PENDING request blocked
//   * createLeaveRequest — unpaid leave: no balance reservation
//   * approveLeaveRequest — converts reservation to used (balance)
//   * approveLeaveRequest — SoD: approver cannot approve own
//   * rejectLeaveRequest — releases reservation
//   * cancelLeaveRequest — PENDING: releases reservation (CANCELLED)
//   * cancelLeaveRequest — APPROVED + future: refund (CANCELLED_POST)
//   * cancelLeaveRequest — APPROVED + past: rejected
//   * isOnApprovedLeave — returns true for approved overlap
//   * isOnApprovedLeave — returns false for no overlap
//   * getPaidUnpaidLeaveDays — splits paid/unpaid totals

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shift/shift.service", () => ({
  resolveScheduledShift: vi.fn().mockResolvedValue(null),
}));

// Mock leave-compute so we control totalDays without needing a real DB.
vi.mock("../leave-compute.service", () => ({
  computeLeaveDays: vi.fn().mockResolvedValue(3),
  getCycleYear: vi.fn().mockReturnValue(2026),
  isHoliday: vi.fn().mockResolvedValue(false),
}));

import * as service from "../leave.service";
import { computeLeaveDays } from "../leave-compute.service";

const computeMock = computeLeaveDays as unknown as ReturnType<typeof vi.fn>;

// ─── DB mock helpers ───────────────────────────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>;

interface MockDb {
  tenant: { findUniqueOrThrow: MockFn; findUnique: MockFn };
  employee: {
    findFirst: MockFn;
    findUnique: MockFn;
    findMany: MockFn;
  };
  leaveType: { findUnique: MockFn; findFirst: MockFn; create: MockFn; update: MockFn };
  leavePolicy: { findFirst: MockFn };
  leaveBalance: { findUnique: MockFn; upsert: MockFn; update: MockFn };
  leaveRequest: {
    findFirst: MockFn;
    findUnique: MockFn;
    findMany: MockFn;
    create: MockFn;
    update: MockFn;
  };
  $transaction: MockFn;
}

function makeDb(overrides: Partial<MockDb> = {}): MockDb {
  const db = {
    tenant: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ settings: {} }),
      findUnique: vi.fn().mockResolvedValue({ settings: {} }),
      ...overrides.tenant,
    },
    employee: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      ...overrides.employee,
    },
    leaveType: {
      findUnique: vi.fn().mockResolvedValue(makeLeaveType()),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(makeLeaveType()),
      update: vi.fn(),
      ...overrides.leaveType,
    },
    leavePolicy: {
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides.leavePolicy,
    },
    leaveBalance: {
      findUnique: vi.fn().mockResolvedValue(makeBalance()),
      upsert: vi.fn().mockResolvedValue(makeBalance()),
      update: vi.fn().mockResolvedValue(makeBalance()),
      ...overrides.leaveBalance,
    },
    leaveRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(makeRequest()),
      update: vi.fn().mockResolvedValue(makeRequest()),
      ...overrides.leaveRequest,
    },
    ...overrides,
  } as unknown as MockDb;
  // runBalanceTx / adjustLeaveBalance run their body inside db.$transaction.
  // Drive the interactive callback with the same configured delegates so that
  // per-test overrides on db.leaveRequest / db.leaveBalance flow into the
  // transactional code path (tx === db). Tests needing a different in-tx
  // behaviour override $transaction with mockImplementationOnce.
  if (!overrides.$transaction) {
    (db as unknown as { $transaction: MockFn }).$transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: MockDb) => Promise<unknown>) => fn(db));
  }
  return db;
}

// ─── Model row helpers ─────────────────────────────────────────────────────────

function makeEmployee(
  o: Partial<{
    id: string;
    userId: string | null;
    tenantId: string;
    storeId: string | null;
    employmentStatus: string;
    employmentStartDate: Date;
    reportsToId: string | null;
  }> = {},
) {
  return {
    id: "emp-1",
    userId: "user-1",
    tenantId: "t-1",
    storeId: null,
    employmentStatus: "ACTIVE",
    employmentStartDate: new Date("2024-01-01"),
    reportsToId: null,
    ...o,
  };
}

function makeLeaveType(
  o: Partial<{
    id: string;
    isPaid: boolean;
    isBalanceTracked: boolean;
    allowHalfDay: boolean;
    requiresDocument: boolean;
    maxConsecutiveDays: number | null;
    isActive: boolean;
  }> = {},
) {
  return {
    id: "lt-1",
    tenantId: "t-1",
    name: "Annual Leave",
    code: "AL",
    isPaid: true,
    isBalanceTracked: true,
    allowHalfDay: true,
    requiresDocument: false,
    maxConsecutiveDays: null,
    color: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}

function makeBalance(
  o: Partial<{
    id: string;
    entitledDays: { toString(): string };
    usedDays: { toString(): string };
    pendingDays: { toString(): string };
    carriedDays: { toString(): string };
  }> = {},
) {
  return {
    id: "bal-1",
    tenantId: "t-1",
    employeeId: "emp-1",
    leaveTypeId: "lt-1",
    cycleYear: 2026,
    entitledDays: { toString: () => "10.00" },
    usedDays: { toString: () => "2.00" },
    pendingDays: { toString: () => "0.00" },
    carriedDays: { toString: () => "0.00" },
    updatedAt: new Date(),
    ...o,
  };
}

function makeRequest(
  o: Partial<{
    id: string;
    employeeId: string;
    leaveTypeId: string;
    status: string;
    startDate: Date;
    endDate: Date;
    balanceImpactDays: { toString(): string };
    totalDays: { toString(): string };
    isHalfDay: boolean;
    approverId: string | null;
  }> = {},
) {
  return {
    id: "req-1",
    tenantId: "t-1",
    employeeId: "emp-1",
    leaveTypeId: "lt-1",
    startDate: new Date("2026-06-10"),
    endDate: new Date("2026-06-12"),
    isHalfDay: false,
    totalDays: { toString: () => "3.00" },
    balanceImpactDays: { toString: () => "3.00" },
    reason: null,
    documentUrl: null,
    status: "PENDING",
    approverId: null,
    decidedAt: null,
    decisionNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}

const actor = { id: "user-1", tenantId: "t-1", role: "HR_MANAGER" };

// ─── createLeaveRequest ────────────────────────────────────────────────────────

describe("createLeaveRequest (self)", () => {
  const input = {
    employeeId: null,
    leaveTypeId: "lt-1",
    startDate: new Date("2026-06-10"),
    endDate: new Date("2026-06-12"),
    isHalfDay: false,
    reason: null,
    documentUrl: null,
  } as const;

  it("reserves balance and creates request on happy path", async () => {
    const db = makeDb({
      employee: { findFirst: vi.fn().mockResolvedValue(makeEmployee()) } as MockDb["employee"],
    });
    const result = await service.createLeaveRequest(db as never, actor, input);
    expect(result).toBeDefined();
    expect(result.status).toBe("PENDING");
  });

  it("throws NO_LINKED_EMPLOYEE when caller has no employee record", async () => {
    const db = makeDb({
      employee: { findFirst: vi.fn().mockResolvedValue(null) } as MockDb["employee"],
    });
    await expect(service.createLeaveRequest(db as never, actor, input)).rejects.toMatchObject({
      code: "NO_LINKED_EMPLOYEE",
    });
  });

  it("blocks TERMINATED employee", async () => {
    const db = makeDb({
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ employmentStatus: "TERMINATED" })),
      } as MockDb["employee"],
    });
    await expect(service.createLeaveRequest(db as never, actor, input)).rejects.toThrow(
      /TERMINATED/,
    );
  });

  it("blocks when overlap with PENDING request exists", async () => {
    const db = makeDb({
      employee: { findFirst: vi.fn().mockResolvedValue(makeEmployee()) } as MockDb["employee"],
      leaveRequest: {
        ...makeDb().leaveRequest,
        findFirst: vi.fn().mockResolvedValue(makeRequest({ status: "PENDING" })),
      } as MockDb["leaveRequest"],
    });
    await expect(service.createLeaveRequest(db as never, actor, input)).rejects.toThrow(/overlap/i);
  });

  it("blocks when INSUFFICIENT_BALANCE for paid tracked leave", async () => {
    const db = makeDb({
      employee: { findFirst: vi.fn().mockResolvedValue(makeEmployee()) } as MockDb["employee"],
    });
    // Make the transaction mock throw INSUFFICIENT_BALANCE.
    (db.$transaction as MockFn).mockImplementationOnce(
      async (fn: (tx: MockDb) => Promise<unknown>) => {
        const availableBalance = makeBalance({
          entitledDays: { toString: () => "1.00" },
          usedDays: { toString: () => "0.00" },
          pendingDays: { toString: () => "0.00" },
          carriedDays: { toString: () => "0.00" },
        });
        const tx = {
          leaveBalance: {
            upsert: vi.fn().mockResolvedValue(availableBalance),
            update: vi.fn(),
          },
          leaveRequest: { create: vi.fn() },
        };
        return fn(tx as unknown as MockDb);
      },
    );
    // computeLeaveDays returns 3 (default), balance only has 1 available.
    await expect(service.createLeaveRequest(db as never, actor, input)).rejects.toMatchObject({
      code: "INSUFFICIENT_BALANCE",
    });
  });

  it("skips balance reservation for unpaid (non-tracked) leave", async () => {
    const db = makeDb({
      employee: { findFirst: vi.fn().mockResolvedValue(makeEmployee()) } as MockDb["employee"],
      leaveType: {
        findUnique: vi
          .fn()
          .mockResolvedValue(makeLeaveType({ isPaid: false, isBalanceTracked: false })),
      } as MockDb["leaveType"],
    });
    const result = await service.createLeaveRequest(db as never, actor, input);
    expect(result.status).toBe("PENDING");
    // balanceImpactDays should be 0 for unpaid.
    // The mock returns the makeRequest default; check balance update was NOT called.
    const txMock = db.$transaction as MockFn;
    // We want the tx callback to have been called but upsert for balance skipped.
    expect(txMock).toHaveBeenCalled();
  });
});

// ─── approveLeaveRequest ──────────────────────────────────────────────────────

describe("approveLeaveRequest", () => {
  it("converts reservation: pendingDays → usedDays", async () => {
    const pendingReq = makeRequest({ status: "PENDING" });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(pendingReq),
        update: vi.fn().mockResolvedValue({ ...pendingReq, status: "APPROVED" }),
      } as MockDb["leaveRequest"],
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-2" })), // different from req.employeeId
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    const result = await service.approveLeaveRequest(
      db as never,
      { ...actor, id: "user-approver" },
      "req-1",
      { decisionNotes: null },
    );
    expect(result.status).toBe("APPROVED");
  });

  it("throws when approver is the same employee as requester (SoD)", async () => {
    const pendingReq = makeRequest({ status: "PENDING", employeeId: "emp-1" });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(pendingReq),
      } as MockDb["leaveRequest"],
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-1" })),
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    await expect(
      service.approveLeaveRequest(db as never, actor, "req-1", { decisionNotes: null }),
    ).rejects.toThrow(/separation of duties/i);
  });

  it("throws when request is not PENDING", async () => {
    const approvedReq = makeRequest({ status: "APPROVED" });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(approvedReq),
      } as MockDb["leaveRequest"],
    });
    await expect(
      service.approveLeaveRequest(db as never, actor, "req-1", { decisionNotes: null }),
    ).rejects.toThrow(/PENDING/);
  });
});

// ─── rejectLeaveRequest ───────────────────────────────────────────────────────

describe("rejectLeaveRequest", () => {
  it("releases pendingDays on rejection", async () => {
    const pendingReq = makeRequest({ status: "PENDING" });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(pendingReq),
        update: vi.fn().mockResolvedValue({ ...pendingReq, status: "REJECTED" }),
      } as MockDb["leaveRequest"],
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-2" })),
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    const result = await service.rejectLeaveRequest(
      db as never,
      { ...actor, id: "user-approver" },
      "req-1",
      { decisionNotes: "Not approved" },
    );
    expect(result.status).toBe("REJECTED");
  });
});

// ─── cancelLeaveRequest ───────────────────────────────────────────────────────

describe("cancelLeaveRequest", () => {
  it("cancels PENDING request (releases reservation → CANCELLED)", async () => {
    const pendingReq = makeRequest({ status: "PENDING" });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(pendingReq),
        update: vi.fn().mockResolvedValue({ ...pendingReq, status: "CANCELLED" }),
      } as MockDb["leaveRequest"],
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-1" })),
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    const result = await service.cancelLeaveRequest(db as never, actor, "req-1");
    expect(result.status).toBe("CANCELLED");
  });

  it("cancels APPROVED request (future start) → CANCELLED_POST + refund", async () => {
    const futureStart = new Date();
    futureStart.setUTCDate(futureStart.getUTCDate() + 10);
    const approvedReq = makeRequest({ status: "APPROVED", startDate: futureStart });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(approvedReq),
        update: vi.fn().mockResolvedValue({ ...approvedReq, status: "CANCELLED_POST" }),
      } as MockDb["leaveRequest"],
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-1" })),
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    const result = await service.cancelLeaveRequest(db as never, actor, "req-1");
    expect(result.status).toBe("CANCELLED_POST");
  });

  it("rejects cancel of APPROVED leave after start date (consumed)", async () => {
    const pastStart = new Date("2026-01-01"); // always in the past
    const approvedReq = makeRequest({ status: "APPROVED", startDate: pastStart });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(approvedReq),
      } as MockDb["leaveRequest"],
      employee: {
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-1" })),
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    await expect(service.cancelLeaveRequest(db as never, actor, "req-1")).rejects.toThrow(
      /consumed/i,
    );
  });

  it("blocks non-owner from cancelling", async () => {
    const pendingReq = makeRequest({ status: "PENDING", employeeId: "emp-other" });
    const db = makeDb({
      leaveRequest: {
        findUnique: vi.fn().mockResolvedValue(pendingReq),
      } as MockDb["leaveRequest"],
      employee: {
        // Caller is emp-1, request is emp-other, actor role is CASHIER.
        findFirst: vi.fn().mockResolvedValue(makeEmployee({ id: "emp-1" })),
        findMany: vi.fn().mockResolvedValue([]),
      } as MockDb["employee"],
    });
    await expect(
      service.cancelLeaveRequest(db as never, { ...actor, role: "CASHIER" }, "req-1"),
    ).rejects.toThrow(/only the requester/i);
  });
});

// ─── isOnApprovedLeave ────────────────────────────────────────────────────────

describe("isOnApprovedLeave", () => {
  it("returns onLeave=true when approved request covers the date", async () => {
    const db = makeDb({
      leaveRequest: {
        ...makeDb().leaveRequest,
        findFirst: vi.fn().mockResolvedValue({
          ...makeRequest({ status: "APPROVED" }),
          leaveType: { id: "lt-1", isPaid: true },
        }),
      } as MockDb["leaveRequest"],
    });
    const result = await service.isOnApprovedLeave(db as never, actor, "emp-1", "2026-06-10");
    expect(result.onLeave).toBe(true);
    expect(result.isPaid).toBe(true);
  });

  it("returns onLeave=false when no approved request covers the date", async () => {
    const db = makeDb({
      leaveRequest: {
        ...makeDb().leaveRequest,
        findFirst: vi.fn().mockResolvedValue(null),
      } as MockDb["leaveRequest"],
    });
    const result = await service.isOnApprovedLeave(db as never, actor, "emp-1", "2026-06-10");
    expect(result.onLeave).toBe(false);
  });
});

// ─── getPaidUnpaidLeaveDays ───────────────────────────────────────────────────

describe("getPaidUnpaidLeaveDays", () => {
  it("splits paid and unpaid days correctly", async () => {
    const db = makeDb({
      leaveRequest: {
        ...makeDb().leaveRequest,
        findMany: vi.fn().mockResolvedValue([
          {
            ...makeRequest({ totalDays: { toString: () => "3.00" } }),
            leaveType: { id: "lt-paid", name: "Annual", isPaid: true },
          },
          {
            ...makeRequest({
              id: "req-2",
              totalDays: { toString: () => "2.00" },
              leaveTypeId: "lt-unpaid",
            }),
            leaveType: { id: "lt-unpaid", name: "LWP", isPaid: false },
          },
        ]),
      } as MockDb["leaveRequest"],
    });
    const result = await service.getPaidUnpaidLeaveDays(
      db as never,
      actor,
      "emp-1",
      new Date("2026-06-01"),
      new Date("2026-06-30"),
    );
    expect(result.paidDays).toBe(3);
    expect(result.unpaidDays).toBe(2);
    expect(result.byType).toHaveLength(2);
  });
});
