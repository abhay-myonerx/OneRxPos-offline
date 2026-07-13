// HRM Shift Swap workflow tests. Per deep-dive §10:
//
//   PENDING_PEER → peer accept → PENDING_MANAGER → manager approve → APPROVED
//                  peer reject              ↓ manager reject → REJECTED
//   PENDING_PEER → requester cancels → CANCELLED
//
// Acceptance checks:
//   * requesterScheduleId must belong to caller (own shift only)
//   * Only one non-terminal swap per schedule at a time
//   * Counterpart must be ACTIVE
//   * respondPeer must be the counterpart employee
//   * approveManager applies the atomic two-row swap on the schedules
//   * Manager scope: both employees must be within caller's team

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as swapService from "../shift-swap.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface EmpRow {
  id: string;
  userId: string | null;
  employmentStatus: string;
  isActive: boolean;
  reportsToId: string | null;
}
interface SchedRow {
  id: string;
  tenantId: string;
  employeeId: string;
  workShiftId: string | null;
  storeId: string | null;
  scheduledDate: Date;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedBreakMinutes: number;
  plannedGraceMinutes: number;
  isOffDay: boolean;
  status: string;
  notes: string | null;
}
interface SwapRow {
  id: string;
  tenantId: string;
  requesterEmployeeId: string;
  requesterScheduleId: string;
  counterpartEmployeeId: string;
  counterpartScheduleId: string | null;
  reason: string | null;
  status: string;
  peerRespondedAt: Date | null;
  managerUserId: string | null;
  managerRespondedAt: Date | null;
  decisionNotes: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function makeDb(
  opts: {
    employees?: EmpRow[];
    schedules?: SchedRow[];
    swaps?: SwapRow[];
  } = {},
) {
  const employees = opts.employees ?? [];
  const schedules = opts.schedules ?? [];
  const swaps = opts.swaps ?? [];

  const db: any = {
    employee: {
      findFirst: vi.fn(({ where }: any) => {
        if (where?.userId) {
          return Promise.resolve(employees.find((e) => e.userId === where.userId) ?? null);
        }
        return Promise.resolve(null);
      }),
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(employees.find((e) => e.id === where.id) ?? null),
      ),
      findMany: vi.fn(({ where }: any = {}) => {
        let out = employees;
        if (where?.id?.in) out = out.filter((e) => where.id.in.includes(e.id));
        if (where?.reportsToId) {
          out = out.filter((e) => e.reportsToId === where.reportsToId);
        }
        return Promise.resolve(out);
      }),
    },
    shiftSchedule: {
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(schedules.find((s) => s.id === where.id) ?? null),
      ),
      update: vi.fn(({ where, data }: any) => {
        const idx = schedules.findIndex((s) => s.id === where.id);
        if (idx < 0) return Promise.reject(new Error("not found"));
        schedules[idx] = { ...schedules[idx]!, ...data };
        return Promise.resolve(schedules[idx]);
      }),
      create: vi.fn(({ data }: any) => {
        const row: SchedRow = {
          id: `sched-new-${schedules.length + 1}`,
          tenantId: data.tenantId,
          employeeId: data.employeeId,
          workShiftId: data.workShiftId ?? null,
          storeId: data.storeId ?? null,
          scheduledDate: data.scheduledDate,
          plannedStart: data.plannedStart ?? null,
          plannedEnd: data.plannedEnd ?? null,
          plannedBreakMinutes: data.plannedBreakMinutes ?? 0,
          plannedGraceMinutes: data.plannedGraceMinutes ?? 0,
          isOffDay: data.isOffDay ?? false,
          status: data.status ?? "SCHEDULED",
          notes: data.notes ?? null,
        };
        schedules.push(row);
        return Promise.resolve(row);
      }),
    },
    shiftSwapRequest: {
      findFirst: vi.fn(({ where }: any = {}) => {
        let out = swaps.filter((s) =>
          where?.status?.in ? where.status.in.includes(s.status) : true,
        );
        if (where?.OR) {
          const matches = (s: SwapRow) =>
            where.OR.some((o: any) => {
              if (o.requesterScheduleId) {
                return s.requesterScheduleId === o.requesterScheduleId;
              }
              if (o.counterpartScheduleId) {
                return s.counterpartScheduleId === o.counterpartScheduleId;
              }
              return false;
            });
          out = out.filter(matches);
        }
        return Promise.resolve(out[0] ?? null);
      }),
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(swaps.find((s) => s.id === where.id) ?? null),
      ),
      findMany: vi.fn(() => Promise.resolve(swaps)),
      count: vi.fn(() => Promise.resolve(swaps.length)),
      create: vi.fn(({ data }: any) => {
        const row: SwapRow = {
          id: `swap-${swaps.length + 1}`,
          tenantId: data.tenantId,
          requesterEmployeeId: data.requesterEmployeeId,
          requesterScheduleId: data.requesterScheduleId,
          counterpartEmployeeId: data.counterpartEmployeeId,
          counterpartScheduleId: data.counterpartScheduleId ?? null,
          reason: data.reason ?? null,
          status: data.status ?? "PENDING_PEER",
          peerRespondedAt: null,
          managerUserId: null,
          managerRespondedAt: null,
          decisionNotes: null,
          expiresAt: data.expiresAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        swaps.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: any) => {
        const idx = swaps.findIndex((s) => s.id === where.id);
        if (idx < 0) return Promise.reject(new Error("not found"));
        swaps[idx] = { ...swaps[idx]!, ...data, updatedAt: new Date() };
        return Promise.resolve(swaps[idx]);
      }),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(db)),
    _schedules: schedules,
    _swaps: swaps,
    _employees: employees,
  };
  return db;
}

const future = (days = 5) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const baseSched = (o: Partial<SchedRow> = {}): SchedRow => ({
  id: "sched-A",
  tenantId: "tenant-1",
  employeeId: "emp-A",
  workShiftId: "tpl-1",
  storeId: "store-1",
  scheduledDate: future(5),
  plannedStart: "09:00",
  plannedEnd: "17:00",
  plannedBreakMinutes: 60,
  plannedGraceMinutes: 15,
  isOffDay: false,
  status: "SCHEDULED",
  notes: null,
  ...o,
});

const empA = {
  id: "emp-A",
  userId: "user-A",
  employmentStatus: "ACTIVE",
  isActive: true,
  reportsToId: "emp-MGR",
};
const empB = {
  id: "emp-B",
  userId: "user-B",
  employmentStatus: "ACTIVE",
  isActive: true,
  reportsToId: "emp-MGR",
};
const empMgr = {
  id: "emp-MGR",
  userId: "user-MGR",
  employmentStatus: "ACTIVE",
  isActive: true,
  reportsToId: null,
};

const actorA = { id: "user-A", tenantId: "tenant-1", role: "EMPLOYEE" } as const;
const actorB = { id: "user-B", tenantId: "tenant-1", role: "EMPLOYEE" } as const;
const actorMgr = {
  id: "user-MGR",
  tenantId: "tenant-1",
  role: "MANAGER",
} as const;
const actorAdmin = { id: "user-AD", tenantId: "tenant-1", role: "ADMIN" } as const;

beforeEach(() => writeMock.mockClear());

describe("shift-swap.service.requestSwap", () => {
  it("creates a PENDING_PEER swap when requester owns the schedule and counterpart is active", async () => {
    const schedA = baseSched({ id: "sched-A", employeeId: "emp-A" });
    const schedB = baseSched({ id: "sched-B", employeeId: "emp-B" });
    const db = makeDb({
      employees: [empA, empB],
      schedules: [schedA, schedB],
    });
    const row = await swapService.requestSwap(db, actorA, {
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: "sched-B",
      reason: "Family event",
    } as never);
    expect(row.status).toBe("PENDING_PEER");
    expect(row.requesterEmployeeId).toBe("emp-A");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SHIFT_SWAP_REQUESTED" }),
    );
  });

  it("rejects when requester does not own the schedule", async () => {
    const schedA = baseSched({ id: "sched-A", employeeId: "emp-A" });
    const db = makeDb({
      employees: [empA, empB],
      schedules: [schedA],
    });
    await expect(
      swapService.requestSwap(db, actorB, {
        requesterScheduleId: "sched-A",
        counterpartEmployeeId: "emp-A",
      } as never),
    ).rejects.toThrow(/own schedule/);
  });

  it("rejects when a non-terminal swap already exists on the same schedule", async () => {
    const schedA = baseSched({ id: "sched-A", employeeId: "emp-A" });
    const schedB = baseSched({ id: "sched-B", employeeId: "emp-B" });
    const open: SwapRow = {
      id: "swap-open",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: "sched-B",
      reason: null,
      status: "PENDING_PEER",
      peerRespondedAt: null,
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      employees: [empA, empB],
      schedules: [schedA, schedB],
      swaps: [open],
    });
    await expect(
      swapService.requestSwap(db, actorA, {
        requesterScheduleId: "sched-A",
        counterpartEmployeeId: "emp-B",
      } as never),
    ).rejects.toMatchObject({ code: "SWAP_ALREADY_PENDING" });
  });

  it("rejects swap requests on past-dated schedules", async () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 3);
    past.setUTCHours(0, 0, 0, 0);
    const schedA = baseSched({
      id: "sched-A",
      employeeId: "emp-A",
      scheduledDate: past,
    });
    const db = makeDb({
      employees: [empA, empB],
      schedules: [schedA],
    });
    await expect(
      swapService.requestSwap(db, actorA, {
        requesterScheduleId: "sched-A",
        counterpartEmployeeId: "emp-B",
      } as never),
    ).rejects.toThrow(/future/);
  });
});

describe("shift-swap.service.respondPeer", () => {
  it("accepts → PENDING_MANAGER, sets peerRespondedAt, writes audit", async () => {
    const schedA = baseSched({ id: "sched-A", employeeId: "emp-A" });
    const schedB = baseSched({ id: "sched-B", employeeId: "emp-B" });
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: "sched-B",
      reason: null,
      status: "PENDING_PEER",
      peerRespondedAt: null,
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      employees: [empA, empB],
      schedules: [schedA, schedB],
      swaps: [swap],
    });
    const out = await swapService.respondPeer(db, actorB, "swap-1", {
      accept: true,
    } as never);
    expect(out.status).toBe("PENDING_MANAGER");
    expect(out.peerRespondedAt).toBeTruthy();
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SHIFT_SWAP_PEER_ACCEPTED" }),
    );
  });

  it("rejects → REJECTED when counterpart declines", async () => {
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: null,
      reason: null,
      status: "PENDING_PEER",
      peerRespondedAt: null,
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ employees: [empA, empB], swaps: [swap] });
    const out = await swapService.respondPeer(db, actorB, "swap-1", {
      accept: false,
    } as never);
    expect(out.status).toBe("REJECTED");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SHIFT_SWAP_PEER_REJECTED" }),
    );
  });

  it("only the counterpart can respond", async () => {
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: null,
      reason: null,
      status: "PENDING_PEER",
      peerRespondedAt: null,
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ employees: [empA, empB], swaps: [swap] });
    await expect(
      swapService.respondPeer(db, actorA, "swap-1", { accept: true } as never),
    ).rejects.toThrow(/counterpart/);
  });
});

describe("shift-swap.service.approveManager", () => {
  it("two-sided approval atomically exchanges template + snapshot between schedules", async () => {
    const schedA = baseSched({
      id: "sched-A",
      employeeId: "emp-A",
      workShiftId: "tpl-morn",
      plannedStart: "09:00",
      plannedEnd: "17:00",
    });
    const schedB = baseSched({
      id: "sched-B",
      employeeId: "emp-B",
      workShiftId: "tpl-eve",
      plannedStart: "13:00",
      plannedEnd: "21:00",
    });
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: "sched-B",
      reason: null,
      status: "PENDING_MANAGER",
      peerRespondedAt: new Date(),
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      employees: [empA, empB, empMgr],
      schedules: [schedA, schedB],
      swaps: [swap],
    });
    const out = await swapService.approveManager(db, actorMgr, "swap-1", {
      approve: true,
      decisionNotes: "Approved",
    } as never);
    expect(out.swap.status).toBe("APPROVED");
    // Schedules swapped template assignment but kept their employeeId
    const newA = db._schedules.find((s: SchedRow) => s.id === "sched-A")!;
    const newB = db._schedules.find((s: SchedRow) => s.id === "sched-B")!;
    expect(newA.workShiftId).toBe("tpl-eve");
    expect(newA.plannedStart).toBe("13:00");
    expect(newB.workShiftId).toBe("tpl-morn");
    expect(newB.plannedStart).toBe("09:00");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SHIFT_SWAP_APPROVED" }),
    );
  });

  it("rejects approval when employees are outside manager's team", async () => {
    const outsider = {
      id: "emp-X",
      userId: "user-X",
      employmentStatus: "ACTIVE",
      isActive: true,
      reportsToId: "emp-OTHER",
    };
    const schedX = baseSched({
      id: "sched-X",
      employeeId: "emp-X",
    });
    const schedA = baseSched({ id: "sched-A", employeeId: "emp-A" });
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-X", // outside mgr's team
      requesterScheduleId: "sched-X",
      counterpartEmployeeId: "emp-A",
      counterpartScheduleId: "sched-A",
      reason: null,
      status: "PENDING_MANAGER",
      peerRespondedAt: new Date(),
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      employees: [empA, outsider, empMgr],
      schedules: [schedA, schedX],
      swaps: [swap],
    });
    await expect(
      swapService.approveManager(db, actorMgr, "swap-1", {
        approve: true,
      } as never),
    ).rejects.toThrow(/team scope/);
  });

  it("ADMIN can approve regardless of team", async () => {
    const schedA = baseSched({ id: "sched-A", employeeId: "emp-A" });
    const schedB = baseSched({ id: "sched-B", employeeId: "emp-B" });
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: "sched-B",
      reason: null,
      status: "PENDING_MANAGER",
      peerRespondedAt: new Date(),
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      employees: [empA, empB],
      schedules: [schedA, schedB],
      swaps: [swap],
    });
    const out = await swapService.approveManager(db, actorAdmin, "swap-1", {
      approve: true,
    } as never);
    expect(out.swap.status).toBe("APPROVED");
  });
});

describe("shift-swap.service.cancelOwn", () => {
  it("requester can cancel a PENDING swap", async () => {
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: null,
      reason: null,
      status: "PENDING_PEER",
      peerRespondedAt: null,
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ employees: [empA, empB], swaps: [swap] });
    const out = await swapService.cancelOwn(db, actorA, "swap-1");
    expect(out.status).toBe("CANCELLED");
  });

  it("non-requester cannot cancel", async () => {
    const swap: SwapRow = {
      id: "swap-1",
      tenantId: "tenant-1",
      requesterEmployeeId: "emp-A",
      requesterScheduleId: "sched-A",
      counterpartEmployeeId: "emp-B",
      counterpartScheduleId: null,
      reason: null,
      status: "PENDING_PEER",
      peerRespondedAt: null,
      managerUserId: null,
      managerRespondedAt: null,
      decisionNotes: null,
      expiresAt: future(2),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ employees: [empA, empB], swaps: [swap] });
    await expect(swapService.cancelOwn(db, actorB, "swap-1")).rejects.toThrow(/requester/);
  });
});
