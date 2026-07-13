// Phase B — concurrent-reservation race (deep-dive §3 / §13-3).
//
// The balance reserve/convert/release/refund flows read a LeaveBalance row
// and write it back. Under the default READ COMMITTED isolation two
// concurrent leave requests can both read the same availableDays, both pass
// the sufficiency check, and both write — over-reserving past entitlement
// (TOCTOU). The fix runs these transactions at SERIALIZABLE isolation and
// retries on the serialization-failure abort Postgres raises (Prisma P2034).
//
// A true two-connection race needs a live database. These tests are the
// deterministic equivalent: they assert the *mechanism* that makes the race
// safe — (1) the transaction runs at SERIALIZABLE, (2) a serialization
// conflict is retried (so the loser re-reads the committed balance), (3)
// retries are bounded, and (4) domain errors (INSUFFICIENT_BALANCE) are
// NOT retried.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../shift/shift.service", () => ({
  resolveScheduledShift: vi.fn().mockResolvedValue(null),
}));
vi.mock("../leave-compute.service", () => ({
  computeLeaveDays: vi.fn().mockResolvedValue(3),
  getCycleYear: vi.fn().mockReturnValue(2026),
  isHoliday: vi.fn().mockResolvedValue(false),
}));

import { Prisma } from "../../../generated/prisma/client";
import * as service from "../leave.service";

type MockFn = ReturnType<typeof vi.fn>;

const actor = { id: "user-1", tenantId: "t-1", role: "HR_MANAGER" };
const input = {
  employeeId: null,
  leaveTypeId: "lt-1",
  startDate: new Date("2026-06-10"),
  endDate: new Date("2026-06-12"),
  isHalfDay: false,
  reason: null,
  documentUrl: null,
} as const;

function balanceRow(entitled = "10.00", used = "2.00", pending = "0.00") {
  return {
    id: "bal-1",
    entitledDays: { toString: () => entitled },
    usedDays: { toString: () => used },
    pendingDays: { toString: () => pending },
    carriedDays: { toString: () => "0.00" },
  };
}

function requestRow() {
  return {
    id: "req-1",
    tenantId: "t-1",
    employeeId: "emp-1",
    leaveTypeId: "lt-1",
    status: "PENDING",
    startDate: new Date("2026-06-10"),
    endDate: new Date("2026-06-12"),
    balanceImpactDays: { toString: () => "3.00" },
    totalDays: { toString: () => "3.00" },
  };
}

// A tx whose balance has `entitled` available headroom.
function makeTx(balance = balanceRow()) {
  return {
    leaveBalance: {
      upsert: vi.fn().mockResolvedValue(balance),
      update: vi.fn().mockResolvedValue(balance),
      findUnique: vi.fn().mockResolvedValue(balance),
    },
    leaveRequest: {
      create: vi.fn().mockResolvedValue(requestRow()),
      update: vi.fn().mockResolvedValue(requestRow()),
    },
  };
}

// Base db with everything the pre-transaction steps of createLeaveRequest
// need; the caller supplies the $transaction implementation.
function makeDb($transaction: MockFn) {
  return {
    tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ settings: {} }) },
    employee: {
      findFirst: vi.fn().mockResolvedValue({
        id: "emp-1",
        userId: "user-1",
        tenantId: "t-1",
        storeId: null,
        employmentStatus: "ACTIVE",
        employmentStartDate: new Date("2024-01-01"),
        reportsToId: null,
      }),
    },
    leaveType: {
      findUnique: vi.fn().mockResolvedValue({
        id: "lt-1",
        isPaid: true,
        isBalanceTracked: true,
        allowHalfDay: true,
        requiresDocument: false,
        maxConsecutiveDays: null,
        isActive: true,
      }),
    },
    leavePolicy: { findFirst: vi.fn().mockResolvedValue(null) },
    leaveRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction,
  } as unknown as Parameters<typeof service.createLeaveRequest>[0];
}

function conflictError() {
  return new Prisma.PrismaClientKnownRequestError(
    "Transaction failed due to a write conflict or a deadlock",
    { code: "P2034", clientVersion: "test" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("leave reservation — concurrency safety", () => {
  it("runs the reservation transaction at SERIALIZABLE isolation", async () => {
    const tx = vi.fn(async (fn: (t: unknown) => unknown, _opts?: { isolationLevel?: unknown }) =>
      fn(makeTx()),
    );
    const db = makeDb(tx as unknown as MockFn);

    await service.createLeaveRequest(db, actor, input);

    expect(tx).toHaveBeenCalledTimes(1);
    const opts = tx.mock.calls[0][1];
    expect(opts?.isolationLevel).toBe(Prisma.TransactionIsolationLevel.Serializable);
  });

  it("retries a serialization conflict (P2034) and then succeeds", async () => {
    let attempt = 0;
    const tx = vi.fn(async (fn: (t: unknown) => unknown, _opts?: { isolationLevel?: unknown }) => {
      attempt += 1;
      if (attempt === 1) throw conflictError(); // loser aborts
      return fn(makeTx()); // retry re-reads committed balance → ok
    });
    const db = makeDb(tx as unknown as MockFn);

    const result = await service.createLeaveRequest(db, actor, input);

    expect(result.status).toBe("PENDING");
    expect(tx).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and propagates the conflict", async () => {
    const tx = vi.fn(async () => {
      throw conflictError();
    });
    const db = makeDb(tx as unknown as MockFn);

    await expect(service.createLeaveRequest(db, actor, input)).rejects.toMatchObject({
      code: "P2034",
    });
    // BALANCE_TX_MAX_ATTEMPTS = 4
    expect(tx).toHaveBeenCalledTimes(4);
  });

  it("does NOT retry a domain error (INSUFFICIENT_BALANCE) — fails fast", async () => {
    // Balance has only 1 day available; impact is 3 → service throws
    // INSUFFICIENT_BALANCE inside the transaction. That is not a
    // serialization conflict, so it must propagate on the first attempt.
    const tx = vi.fn(async (fn: (t: unknown) => unknown) =>
      fn(makeTx(balanceRow("1.00", "0.00", "0.00"))),
    );
    const db = makeDb(tx as unknown as MockFn);

    await expect(service.createLeaveRequest(db, actor, input)).rejects.toMatchObject({
      code: "INSUFFICIENT_BALANCE",
    });
    expect(tx).toHaveBeenCalledTimes(1);
  });
});
