import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../attendance.correction.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface EmployeeRow {
  id: string;
  userId: string | null;
  reportsToId: string | null;
}
interface CorrRow {
  id: string;
  tenantId: string;
  employeeId: string;
  status: string;
  requestedDate: Date;
  requestedTime: Date;
  eventType: string;
  employee?: { reportsToId: string | null };
}

function makeDb(
  opts: {
    employees?: EmployeeRow[];
    corrections?: CorrRow[];
  } = {},
) {
  const employees = opts.employees ?? [];
  const corrections = opts.corrections ?? [];
  const records: any[] = [];
  return {
    employee: {
      findFirst: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.userId) {
          return Promise.resolve(employees.find((e) => e.userId === where.userId) ?? null);
        }
        return Promise.resolve(null);
      }),
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(employees.find((e) => e.id === where.id) ?? null),
        ),
      findMany: vi.fn().mockResolvedValue([]),
    },
    attendanceCorrection: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(corrections.find((c) => c.id === where.id) ?? null),
        ),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const row: CorrRow = {
          id: `corr-${corrections.length + 1}`,
          tenantId: data.tenantId,
          employeeId: data.employeeId,
          status: data.status,
          requestedDate: data.requestedDate,
          requestedTime: data.requestedTime,
          eventType: data.eventType,
        };
        corrections.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockImplementation(({ where, data }: any) => {
        const row = corrections.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    attendanceRecord: {
      create: vi.fn().mockImplementation(({ data }: any) => {
        const row = { id: `rec-${records.length + 1}`, ...data };
        records.push(row);
        return Promise.resolve(row);
      }),
    },
  } as any;
}

const selfActor = { id: "user-1", tenantId: "tenant-1", role: "EMPLOYEE" } as const;
const adminActor = { id: "user-admin", tenantId: "tenant-1", role: "ADMIN" } as const;
const managerActor = { id: "user-mgr", tenantId: "tenant-1", role: "MANAGER" } as const;

beforeEach(() => writeMock.mockClear());

describe("correction.request", () => {
  it("self request resolves employee from userId and writes audit", async () => {
    const db = makeDb({
      employees: [{ id: "emp-1", userId: "user-1", reportsToId: null }],
    });
    const out = await service.request(db, selfActor, {
      requestedDate: new Date(),
      eventType: "CHECK_IN",
      requestedTime: new Date(),
      reason: "Forgot to punch in",
    } as never);
    expect((out as any).employeeId).toBe("emp-1");
    expect((out as any).status).toBe("PENDING");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_CORRECTION_REQUESTED",
      }),
    );
  });

  it("rejects self request beyond the 7-day window", async () => {
    const db = makeDb({
      employees: [{ id: "emp-1", userId: "user-1", reportsToId: null }],
    });
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await expect(
      service.request(db, selfActor, {
        requestedDate: past,
        eventType: "CHECK_IN",
        requestedTime: past,
        reason: "Old missed punch",
      } as never),
    ).rejects.toMatchObject({ code: "REGULARIZATION_WINDOW_EXCEEDED" });
  });

  it("admin bypass: HR can backdate beyond the window", async () => {
    const db = makeDb({
      employees: [{ id: "emp-x", userId: "u-x", reportsToId: null }],
    });
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const out = await service.request(db, adminActor, {
      employeeId: "emp-x",
      requestedDate: past,
      eventType: "CHECK_IN",
      requestedTime: past,
      reason: "Backfill terminated employee final week",
    } as never);
    expect((out as any).employeeId).toBe("emp-x");
  });

  it("409 NO_LINKED_EMPLOYEE for self-only request with no linked employee", async () => {
    const db = makeDb({ employees: [] });
    await expect(
      service.request(db, selfActor, {
        requestedDate: new Date(),
        eventType: "CHECK_IN",
        requestedTime: new Date(),
        reason: "Hello",
      } as never),
    ).rejects.toMatchObject({ code: "NO_LINKED_EMPLOYEE" });
  });
});

describe("correction.approve", () => {
  it("creates an immutable record and transitions to APPROVED", async () => {
    const corr: CorrRow = {
      id: "corr-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      status: "PENDING",
      requestedDate: new Date("2026-05-20"),
      requestedTime: new Date("2026-05-20T09:00:00Z"),
      eventType: "CHECK_IN",
      employee: { reportsToId: null },
    };
    const db = makeDb({
      employees: [{ id: "emp-1", userId: "user-1", reportsToId: null }],
      corrections: [corr],
    });
    const out = await service.approve(db, adminActor, "corr-1", {
      managerNotes: "OK",
    });
    expect((out.correction as any).status).toBe("APPROVED");
    expect((out.record as any).isRegularized).toBe(true);
    expect((out.record as any).method).toBe("MANUAL");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_CORRECTION_APPROVED",
      }),
    );
  });

  it("blocks approval when correction is not PENDING", async () => {
    const corr: CorrRow = {
      id: "corr-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      status: "APPROVED",
      requestedDate: new Date(),
      requestedTime: new Date(),
      eventType: "CHECK_IN",
      employee: { reportsToId: null },
    };
    const db = makeDb({
      employees: [{ id: "emp-1", userId: "user-1", reportsToId: null }],
      corrections: [corr],
    });
    await expect(service.approve(db, adminActor, "corr-1", {} as any)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("MANAGER cannot approve a correction outside their team", async () => {
    const corr: CorrRow = {
      id: "corr-1",
      tenantId: "tenant-1",
      employeeId: "emp-outside",
      status: "PENDING",
      requestedDate: new Date(),
      requestedTime: new Date(),
      eventType: "CHECK_IN",
      employee: { reportsToId: "someone-else" },
    };
    const db = makeDb({
      employees: [
        { id: "mgr-emp", userId: "user-mgr", reportsToId: null },
        { id: "emp-outside", userId: "u-out", reportsToId: "someone-else" },
      ],
      corrections: [corr],
    });
    await expect(service.approve(db, managerActor, "corr-1", {} as any)).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
    });
  });
});

describe("correction.reject + cancel", () => {
  it("reject transitions PENDING → REJECTED with manager notes", async () => {
    const corr: CorrRow = {
      id: "corr-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      status: "PENDING",
      requestedDate: new Date(),
      requestedTime: new Date(),
      eventType: "CHECK_IN",
      employee: { reportsToId: null },
    };
    const db = makeDb({
      employees: [{ id: "emp-1", userId: "user-1", reportsToId: null }],
      corrections: [corr],
    });
    const out = await service.reject(db, adminActor, "corr-1", {
      managerNotes: "No evidence",
    });
    expect((out as any).status).toBe("REJECTED");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_CORRECTION_REJECTED",
      }),
    );
  });

  it("cancelOwn only by the requesting employee", async () => {
    const corr: CorrRow = {
      id: "corr-1",
      tenantId: "tenant-1",
      employeeId: "emp-self",
      status: "PENDING",
      requestedDate: new Date(),
      requestedTime: new Date(),
      eventType: "CHECK_IN",
      employee: { reportsToId: null },
    };
    const db = makeDb({
      employees: [{ id: "emp-self", userId: "user-1", reportsToId: null }],
      corrections: [corr],
    });
    const out = await service.cancelOwn(db, selfActor, "corr-1");
    expect((out as any).status).toBe("CANCELLED");
  });

  it("cancelOwn blocked when caller is a different employee", async () => {
    const corr: CorrRow = {
      id: "corr-1",
      tenantId: "tenant-1",
      employeeId: "emp-other",
      status: "PENDING",
      requestedDate: new Date(),
      requestedTime: new Date(),
      eventType: "CHECK_IN",
      employee: { reportsToId: null },
    };
    const db = makeDb({
      employees: [
        { id: "emp-self", userId: "user-1", reportsToId: null },
        { id: "emp-other", userId: "u-2", reportsToId: null },
      ],
      corrections: [corr],
    });
    await expect(service.cancelOwn(db, selfActor, "corr-1")).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
    });
  });
});
