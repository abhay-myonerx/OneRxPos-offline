// HR background sweeps (OI-034/035/036).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    shiftSwapRequest: { updateMany: vi.fn() },
    shiftSchedule: { findMany: vi.fn(), update: vi.fn() },
    attendanceRecord: { findFirst: vi.fn() },
    leaveRequest: { findFirst: vi.fn() },
    leavePolicy: { findMany: vi.fn() },
    leaveBalance: { updateMany: vi.fn() },
  },
}));
vi.mock("../../config/database", () => ({ prisma: prismaMock }));
vi.mock("../../shared/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  processLeaveMonthlyAccrual,
  processShiftEodReconcile,
  processShiftSwapExpiry,
} from "../hrSweeps.job";

function makeJob<T>(data: T): Job<T> {
  return { data, id: "test-job" } as unknown as Job<T>;
}

beforeEach(() => {
  for (const m of Object.values(prismaMock)) {
    for (const f of Object.values(m)) {
      (f as ReturnType<typeof vi.fn>).mockReset();
    }
  }
});

describe("processShiftSwapExpiry", () => {
  it("transitions all PENDING_* rows past expiresAt to EXPIRED", async () => {
    prismaMock.shiftSwapRequest.updateMany.mockResolvedValue({ count: 7 });
    const result = await processShiftSwapExpiry(makeJob({ scheduledAt: new Date().toISOString() }));
    expect(result.expired).toBe(7);
    const where = prismaMock.shiftSwapRequest.updateMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(["PENDING_PEER", "PENDING_MANAGER"]);
    expect(where.expiresAt.lt).toBeInstanceOf(Date);
  });
});

describe("processShiftEodReconcile", () => {
  it("marks scheduled rows COMPLETED when the employee punched in", async () => {
    prismaMock.shiftSchedule.findMany.mockResolvedValue([
      { id: "sched-1", tenantId: "t1", employeeId: "e1" },
    ]);
    prismaMock.attendanceRecord.findFirst.mockResolvedValue({
      id: "att-1",
    });
    prismaMock.shiftSchedule.update.mockResolvedValue({});

    const result = await processShiftEodReconcile(makeJob({ date: "2026-06-01" }));
    expect(result.touched).toBe(1);
    expect(prismaMock.shiftSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-1" },
      data: { status: "COMPLETED" },
    });
    // Leave wasn't checked because the punch path returned early.
    expect(prismaMock.leaveRequest.findFirst).not.toHaveBeenCalled();
  });

  it("marks scheduled rows ON_LEAVE when an approved leave covers the day", async () => {
    prismaMock.shiftSchedule.findMany.mockResolvedValue([
      { id: "sched-2", tenantId: "t1", employeeId: "e2" },
    ]);
    prismaMock.attendanceRecord.findFirst.mockResolvedValue(null);
    prismaMock.leaveRequest.findFirst.mockResolvedValue({ id: "lr-1" });
    prismaMock.shiftSchedule.update.mockResolvedValue({});

    await processShiftEodReconcile(makeJob({ date: "2026-06-01" }));
    expect(prismaMock.shiftSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-2" },
      data: { status: "ON_LEAVE" },
    });
  });

  it("marks scheduled rows ABSENT otherwise", async () => {
    prismaMock.shiftSchedule.findMany.mockResolvedValue([
      { id: "sched-3", tenantId: "t1", employeeId: "e3" },
    ]);
    prismaMock.attendanceRecord.findFirst.mockResolvedValue(null);
    prismaMock.leaveRequest.findFirst.mockResolvedValue(null);
    prismaMock.shiftSchedule.update.mockResolvedValue({});

    await processShiftEodReconcile(makeJob({ date: "2026-06-01" }));
    expect(prismaMock.shiftSchedule.update).toHaveBeenCalledWith({
      where: { id: "sched-3" },
      data: { status: "ABSENT" },
    });
  });
});

describe("processLeaveMonthlyAccrual", () => {
  it("increments entitledDays by entitledDaysPerYear/12 for every active monthly policy", async () => {
    prismaMock.leavePolicy.findMany.mockResolvedValue([
      {
        id: "pol-1",
        tenantId: "t1",
        leaveTypeId: "lt-1",
        entitledDaysPerYear: { toString: () => "12" },
      },
    ]);
    prismaMock.leaveBalance.updateMany.mockResolvedValue({ count: 8 });

    const result = await processLeaveMonthlyAccrual(makeJob({ month: "2026-06" }));
    expect(result.adjustments).toBe(8);
    const call = prismaMock.leaveBalance.updateMany.mock.calls[0]![0];
    expect(call.where.tenantId).toBe("t1");
    expect(call.where.leaveTypeId).toBe("lt-1");
    // 12/12 = 1.0
    expect(call.data.entitledDays.increment).toBe(1);
  });

  it("returns 0 when no monthly policies are configured", async () => {
    prismaMock.leavePolicy.findMany.mockResolvedValue([]);
    const result = await processLeaveMonthlyAccrual(makeJob({ month: "2026-06" }));
    expect(result.adjustments).toBe(0);
    expect(prismaMock.leaveBalance.updateMany).not.toHaveBeenCalled();
  });
});
