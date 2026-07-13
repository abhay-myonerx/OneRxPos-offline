import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../attendance.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface EmployeeRow {
  id: string;
  userId: string | null;
  storeId: string | null;
  employmentStatus: string;
  isActive: boolean;
  reportsToId: string | null;
}

interface AttRow {
  id: string;
  tenantId: string;
  employeeId: string;
  eventType: string;
  occurredAt: Date;
  method: string;
  isRegularized: boolean;
  createdByUserId: string | null;
}

function makeEmp(o: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: "emp-self",
    userId: "user-1",
    storeId: "store-1",
    employmentStatus: "ACTIVE",
    isActive: true,
    reportsToId: null,
    ...o,
  };
}

function makeDb(
  opts: {
    employees?: EmployeeRow[];
    records?: AttRow[];
  } = {},
) {
  const employees = opts.employees ?? [];
  const records: AttRow[] = opts.records ?? [];
  const db: any = {
    _records: records,
    employee: {
      findFirst: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.userId) {
          return Promise.resolve(employees.find((e) => e.userId === where.userId) ?? null);
        }
        if (where?.reportsToId) {
          return Promise.resolve(
            employees.find((e) => e.reportsToId === where.reportsToId) ?? null,
          );
        }
        return Promise.resolve(null);
      }),
      findUnique: vi
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(employees.find((e) => e.id === where.id) ?? null),
        ),
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where?.reportsToId) {
          return Promise.resolve(employees.filter((e) => e.reportsToId === where.reportsToId));
        }
        return Promise.resolve([]);
      }),
    },
    attendanceRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        let out = records.filter((r) => r.employeeId === where?.employeeId);
        if (where?.occurredAt?.gte) {
          out = out.filter(
            (r) => r.occurredAt.getTime() >= (where.occurredAt.gte as Date).getTime(),
          );
        }
        if (where?.occurredAt?.lte) {
          out = out.filter(
            (r) => r.occurredAt.getTime() <= (where.occurredAt.lte as Date).getTime(),
          );
        }
        if (where?.occurredAt?.lt) {
          out = out.filter((r) => r.occurredAt.getTime() < (where.occurredAt.lt as Date).getTime());
        }
        return Promise.resolve(out);
      }),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const row: AttRow = {
          id: `rec-${records.length + 1}`,
          tenantId: data.tenantId,
          employeeId: data.employeeId,
          eventType: data.eventType,
          occurredAt: data.occurredAt,
          method: data.method,
          isRegularized: data.isRegularized ?? false,
          createdByUserId: data.createdByUserId ?? null,
        };
        records.push(row);
        return Promise.resolve(row);
      }),
    },
    // Shift context lookup needs shiftSchedule;
    // default empty rows so the existing tests degrade
    // gracefully (no shift = no late/OT computation).
    shiftSchedule: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Geofence/IP enforcement looks up store geo
    // config on punch when method ≠ WEB/MANUAL.
    store: {
      findUnique: vi.fn().mockResolvedValue({
        geoLat: null,
        geoLng: null,
        geoRadiusM: null,
        ipWhitelist: [],
        attendanceMethods: [],
      }),
    },
  };
  return db;
}

const selfActor = { id: "user-1", tenantId: "tenant-1", role: "EMPLOYEE" } as const;
const adminActor = { id: "admin-1", tenantId: "tenant-1", role: "ADMIN" } as const;
const managerActor = { id: "mgr-1", tenantId: "tenant-1", role: "MANAGER" } as const;

beforeEach(() => writeMock.mockClear());

describe("attendance.service.punch — self check-in", () => {
  it("creates a record and writes audit", async () => {
    const me = makeEmp();
    const db = makeDb({ employees: [me] });
    const occurred = new Date("2026-05-20T09:00:00Z");
    const out = await service.punch(
      db,
      selfActor,
      "CHECK_IN",
      { employeeId: null, method: "WEB", occurredAt: occurred } as any,
      {},
    );
    expect(out.deduplicated).toBe(false);
    expect((out.record as AttRow).eventType).toBe("CHECK_IN");
    expect((out.record as AttRow).method).toBe("WEB");
    expect((out.record as AttRow).employeeId).toBe("emp-self");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_PUNCH",
        entityType: "AttendanceRecord",
      }),
    );
  });

  it("409 NO_LINKED_EMPLOYEE when caller has no employee row", async () => {
    const db = makeDb({ employees: [] });
    await expect(
      service.punch(db, selfActor, "CHECK_IN", { employeeId: null, method: "WEB" } as any, {}),
    ).rejects.toMatchObject({ code: "NO_LINKED_EMPLOYEE" });
  });

  it("blocks terminated employees", async () => {
    const me = makeEmp({ employmentStatus: "TERMINATED" });
    const db = makeDb({ employees: [me] });
    await expect(
      service.punch(db, selfActor, "CHECK_IN", { employeeId: null, method: "WEB" } as any, {}),
    ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_ACTIVE" });
  });

  it("blocks inactive employees", async () => {
    const me = makeEmp({ isActive: false });
    const db = makeDb({ employees: [me] });
    await expect(
      service.punch(db, selfActor, "CHECK_IN", { employeeId: null, method: "WEB" } as any, {}),
    ).rejects.toMatchObject({ code: "EMPLOYEE_NOT_ACTIVE" });
  });

  it("does not block sequence anomalies — double check-in still records, with warning", async () => {
    const me = makeEmp();
    const earlier: AttRow = {
      id: "r-0",
      tenantId: "tenant-1",
      employeeId: me.id,
      eventType: "CHECK_IN",
      occurredAt: new Date("2026-05-20T08:00:00Z"),
      method: "WEB",
      isRegularized: false,
      createdByUserId: null,
    };
    const db = makeDb({ employees: [me], records: [earlier] });
    const out = await service.punch(
      db,
      selfActor,
      "CHECK_IN",
      { employeeId: null, method: "WEB", occurredAt: new Date("2026-05-20T09:00:00Z") } as any,
      {},
    );
    expect(out.warnings).toContain("DOUBLE_CHECK_IN");
    expect(out.record).toBeDefined();
  });

  it("flags CHECK_OUT_WITHOUT_CHECK_IN but still records", async () => {
    const me = makeEmp();
    const db = makeDb({ employees: [me] });
    const out = await service.punch(
      db,
      selfActor,
      "CHECK_OUT",
      { employeeId: null, method: "WEB", occurredAt: new Date("2026-05-20T17:00:00Z") } as any,
      {},
    );
    expect(out.warnings).toContain("CHECK_OUT_WITHOUT_CHECK_IN");
    expect(out.record).toBeDefined();
  });

  it("deduplicates a punch within the 1s window", async () => {
    const me = makeEmp();
    const occurred = new Date("2026-05-20T09:00:00Z");
    const dup: AttRow = {
      id: "r-1",
      tenantId: "tenant-1",
      employeeId: me.id,
      eventType: "CHECK_IN",
      occurredAt: occurred,
      method: "WEB",
      isRegularized: false,
      createdByUserId: null,
    };
    const db = makeDb({ employees: [me], records: [dup] });
    // override findFirst to return the dup
    db.attendanceRecord.findFirst.mockResolvedValueOnce(dup);
    const out = await service.punch(
      db,
      selfActor,
      "CHECK_IN",
      { employeeId: null, method: "WEB", occurredAt: occurred } as any,
      {},
    );
    expect(out.deduplicated).toBe(true);
    // No second audit write should happen on a dedup
    expect(writeMock).not.toHaveBeenCalled();
  });
});

describe("attendance.service.punch — manual for another employee", () => {
  it("forces method=MANUAL when admin punches for another employee", async () => {
    const me = makeEmp({ id: "emp-self", userId: "user-1" });
    const other = makeEmp({ id: "emp-other", userId: "user-other" });
    const db = makeDb({ employees: [me, other] });
    const out = await service.punch(
      db,
      adminActor,
      "CHECK_IN",
      {
        employeeId: "emp-other",
        method: "GEOFENCE",
        occurredAt: new Date("2026-05-20T09:00:00Z"),
      } as any,
      {},
    );
    expect((out.record as AttRow).method).toBe("MANUAL");
    expect((out.record as AttRow).employeeId).toBe("emp-other");
  });

  it("404 when target employee is missing", async () => {
    const db = makeDb({ employees: [] });
    await expect(
      service.punch(db, adminActor, "CHECK_IN", { employeeId: "emp-missing" } as any, {}),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("attendance.service.list — scoping", () => {
  it("MANAGER team scope queries by manager+reports", async () => {
    const mgrEmp = makeEmp({ id: "mgr-emp", userId: "mgr-1" });
    const report = makeEmp({ id: "rep-1", userId: "u-rep", reportsToId: "mgr-emp" });
    const db = makeDb({ employees: [mgrEmp, report] });
    db.attendanceRecord.findMany.mockResolvedValueOnce([]);
    db.attendanceRecord.count.mockResolvedValueOnce(0);
    await service.list(db, managerActor, {
      page: 1,
      limit: 20,
      sortBy: "occurredAt",
      sortOrder: "desc",
      scope: "team",
    } as never);
    const where = (db.attendanceRecord.findMany.mock.calls[0][0] as any).where;
    expect(where.employeeId.in).toContain("mgr-emp");
    expect(where.employeeId.in).toContain("rep-1");
  });

  it("EMPLOYEE scope restricts to caller's own records", async () => {
    const me = makeEmp({ id: "emp-self", userId: "user-1" });
    const db = makeDb({ employees: [me] });
    db.attendanceRecord.findMany.mockResolvedValueOnce([]);
    db.attendanceRecord.count.mockResolvedValueOnce(0);
    await service.list(db, selfActor, {
      page: 1,
      limit: 20,
      sortBy: "occurredAt",
      sortOrder: "desc",
    } as never);
    const where = (db.attendanceRecord.findMany.mock.calls[0][0] as any).where;
    expect(where.employeeId).toBe("emp-self");
  });

  it("rejects EMPLOYEE asking for scope=all", async () => {
    const me = makeEmp({ id: "emp-self", userId: "user-1" });
    const db = makeDb({ employees: [me] });
    await expect(
      service.list(db, selfActor, {
        page: 1,
        limit: 20,
        sortBy: "occurredAt",
        sortOrder: "desc",
        scope: "all",
      } as never),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });

  it("ADMIN scope=all returns no employeeId filter", async () => {
    const db = makeDb({ employees: [] });
    db.attendanceRecord.findMany.mockResolvedValueOnce([]);
    db.attendanceRecord.count.mockResolvedValueOnce(0);
    await service.list(db, adminActor, {
      page: 1,
      limit: 20,
      sortBy: "occurredAt",
      sortOrder: "desc",
    } as never);
    const where = (db.attendanceRecord.findMany.mock.calls[0][0] as any).where;
    expect(where.employeeId).toBeUndefined();
  });

  it("blocks EMPLOYEE from filtering for another employee's records", async () => {
    const me = makeEmp({ id: "emp-self", userId: "user-1" });
    const db = makeDb({ employees: [me] });
    await expect(
      service.list(db, selfActor, {
        page: 1,
        limit: 20,
        sortBy: "occurredAt",
        sortOrder: "desc",
        employeeId: "emp-other",
      } as never),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });

  it("applies date boundary filters", async () => {
    const me = makeEmp({ id: "emp-self", userId: "user-1" });
    const db = makeDb({ employees: [me] });
    db.attendanceRecord.findMany.mockResolvedValueOnce([]);
    db.attendanceRecord.count.mockResolvedValueOnce(0);
    const from = new Date("2026-05-01T00:00:00Z");
    const to = new Date("2026-05-31T23:59:59Z");
    await service.list(db, selfActor, {
      page: 1,
      limit: 20,
      sortBy: "occurredAt",
      sortOrder: "desc",
      from,
      to,
    } as never);
    const where = (db.attendanceRecord.findMany.mock.calls[0][0] as any).where;
    expect(where.occurredAt.gte).toEqual(from);
    expect(where.occurredAt.lte).toEqual(to);
  });
});

describe("attendance.service.getSummary", () => {
  it("returns derived days + totals for a single employee", async () => {
    const me = makeEmp({ id: "emp-self", userId: "user-1" });
    const db = makeDb({ employees: [me] });
    db.attendanceRecord.findMany.mockResolvedValueOnce([
      {
        id: "a",
        employeeId: "emp-self",
        eventType: "CHECK_IN",
        occurredAt: new Date("2026-05-20T09:00:00Z"),
        isRegularized: false,
      },
      {
        id: "b",
        employeeId: "emp-self",
        eventType: "CHECK_OUT",
        occurredAt: new Date("2026-05-20T17:00:00Z"),
        isRegularized: false,
      },
    ]);
    const out = await service.getSummary(db, selfActor, {
      employeeId: "emp-self",
      from: new Date("2026-05-20T00:00:00Z"),
      to: new Date("2026-05-20T23:59:59Z"),
    } as never);
    expect("days" in out).toBe(true);
    const totals = (out as { totals: Record<string, number> }).totals;
    expect(totals.workedMinutes).toBe(8 * 60);
    expect(totals.presentDays).toBe(1);
  });
});
