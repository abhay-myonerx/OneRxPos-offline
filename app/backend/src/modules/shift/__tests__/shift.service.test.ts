// HRM Shifts service unit tests. Per
// docs/v2/hrm-deep-dives/3.hrm-shifts.md acceptance criteria:
//
//   * WorkShift CRUD (create/update/deactivate) writes audit + enforces
//     the future-scheduled delete-guard.
//   * Bulk roster create snapshots the template (NOT a live join) and
//     reports per-row conflicts without aborting the batch.
//   * Conflicting bulk inserts return structured `conflicts[]`.
//   * Overnight shifts are valid (endTime < startTime ⇒ isNightShift).
//   * `resolveScheduledShift()` returns the snapshot — the frozen
//     contract attendance derivation consumes — and degrades to `null`
//     when no schedule exists.
//   * Tenant isolation (operations go through `req.db` only — we mock
//     the tenant client and never touch `actor.tenantId` for scoping).
//
// All Prisma + audit logging is mocked via `vi.mock(...)`; no DB.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

import * as service from "../shift.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

// ─── Mock DB factory ───────────────────────────────────────────────────────────

interface TplRow {
  id: string;
  tenantId: string;
  storeId: string | null;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  isNightShift: boolean;
  nightDifferentialPct: number | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

interface EmpRow {
  id: string;
  userId: string | null;
  storeId: string | null;
  employmentStatus: string;
  isActive: boolean;
  reportsToId: string | null;
}

function makeTpl(o: Partial<TplRow> = {}): TplRow {
  return {
    id: "tpl-1",
    tenantId: "tenant-1",
    storeId: null,
    name: "Morning",
    code: "MORN",
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 60,
    graceMinutes: 15,
    isNightShift: false,
    nightDifferentialPct: null,
    color: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}

function makeEmp(o: Partial<EmpRow> = {}): EmpRow {
  return {
    id: "emp-1",
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
    templates?: TplRow[];
    schedules?: SchedRow[];
    employees?: EmpRow[];
    stores?: string[];
  } = {},
) {
  const templates: TplRow[] = opts.templates ?? [];
  const schedules: SchedRow[] = opts.schedules ?? [];
  const employees: EmpRow[] = opts.employees ?? [];
  const stores: string[] = opts.stores ?? ["store-1"];

  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  const db: any = {
    _templates: templates,
    _schedules: schedules,
    _employees: employees,
    store: {
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(stores.includes(where.id) ? { id: where.id } : null),
      ),
    },
    workShift: {
      findFirst: vi.fn(({ where }: any) => {
        let out = templates;
        if (where?.code !== undefined) {
          out = out.filter((t) => t.code === where.code);
        }
        if (where?.NOT?.id) {
          out = out.filter((t) => t.id !== where.NOT.id);
        }
        return Promise.resolve(out[0] ?? null);
      }),
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(templates.find((t) => t.id === where.id) ?? null),
      ),
      findMany: vi.fn(({ where }: any = {}) => {
        let out = templates;
        if (where?.id?.in) out = out.filter((t) => where.id.in.includes(t.id));
        return Promise.resolve(out);
      }),
      count: vi.fn(() => Promise.resolve(templates.length)),
      create: vi.fn(({ data, select: _s }: any) => {
        const row: TplRow = {
          ...makeTpl(),
          ...data,
          id: `tpl-${templates.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        templates.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: any) => {
        const idx = templates.findIndex((t) => t.id === where.id);
        if (idx < 0) return Promise.reject(new Error("not found"));
        templates[idx] = { ...templates[idx]!, ...data, updatedAt: new Date() };
        return Promise.resolve(templates[idx]);
      }),
    },
    shiftSchedule: {
      findFirst: vi.fn(({ where }: any) => {
        let out = schedules;
        if (where?.employeeId) out = out.filter((s) => s.employeeId === where.employeeId);
        if (where?.scheduledDate) {
          const day = where.scheduledDate instanceof Date ? isoDay(where.scheduledDate) : null;
          if (day) out = out.filter((s) => isoDay(s.scheduledDate) === day);
        }
        return Promise.resolve(out[0] ?? null);
      }),
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(schedules.find((s) => s.id === where.id) ?? null),
      ),
      findMany: vi.fn(({ where }: any = {}) => {
        let out = schedules;
        if (where?.workShiftId) out = out.filter((s) => s.workShiftId === where.workShiftId);
        if (where?.status) {
          const want = Array.isArray(where.status?.in) ? where.status.in : [where.status];
          out = out.filter((s) => want.includes(s.status));
        }
        if (where?.scheduledDate?.gte) {
          const gte = where.scheduledDate.gte as Date;
          out = out.filter((s) => s.scheduledDate.getTime() >= gte.getTime());
        }
        return Promise.resolve(out);
      }),
      count: vi.fn(({ where }: any = {}) => {
        let out = schedules;
        if (where?.workShiftId) out = out.filter((s) => s.workShiftId === where.workShiftId);
        if (where?.status) out = out.filter((s) => s.status === where.status);
        if (where?.scheduledDate?.gte) {
          const gte = where.scheduledDate.gte as Date;
          out = out.filter((s) => s.scheduledDate.getTime() >= gte.getTime());
        }
        return Promise.resolve(out.length);
      }),
      create: vi.fn(({ data }: any) => {
        const row: SchedRow = {
          id: `sched-${schedules.length + 1}`,
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
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        schedules.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: any) => {
        const idx = schedules.findIndex((s) => s.id === where.id);
        if (idx < 0) return Promise.reject(new Error("not found"));
        schedules[idx] = { ...schedules[idx]!, ...data, updatedAt: new Date() };
        return Promise.resolve(schedules[idx]);
      }),
    },
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
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
      return fn(db);
    }),
  };
  return db;
}

const adminActor = { id: "admin-1", tenantId: "tenant-1", role: "ADMIN" } as const;
const managerActor = { id: "mgr-1", tenantId: "tenant-1", role: "MANAGER" } as const;
const employeeActor = { id: "user-1", tenantId: "tenant-1", role: "EMPLOYEE" } as const;

beforeEach(() => writeMock.mockClear());

// ─── WorkShift template ────────────────────────────────────────────────────────

describe("shift.service.createTemplate", () => {
  it("creates a template and writes audit", async () => {
    const db = makeDb();
    const row = await service.createTemplate(db, adminActor, {
      name: "Morning",
      code: "MORN",
      storeId: null,
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 60,
      graceMinutes: 15,
    } as never);
    expect(row.code).toBe("MORN");
    expect(row.isNightShift).toBe(false);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WORKSHIFT_CREATED" }),
    );
  });

  it("infers isNightShift=true for crosses-midnight (endTime < startTime)", async () => {
    const db = makeDb();
    const row = await service.createTemplate(db, adminActor, {
      name: "Night",
      code: "NIGHT",
      startTime: "22:00",
      endTime: "06:00",
      breakMinutes: 30,
      graceMinutes: 10,
    } as never);
    expect(row.isNightShift).toBe(true);
  });

  it("rejects duplicate code", async () => {
    const db = makeDb({ templates: [makeTpl({ code: "MORN" })] });
    await expect(
      service.createTemplate(db, adminActor, {
        name: "Other",
        code: "MORN",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 0,
        graceMinutes: 0,
      } as never),
    ).rejects.toThrow(/already exists/);
  });
});

describe("shift.service.deactivateTemplate", () => {
  it("blocks deactivation when future SCHEDULED rows reference the template", async () => {
    const tpl = makeTpl();
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 5);
    const sched: SchedRow = {
      id: "sched-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: tpl.id,
      storeId: "store-1",
      scheduledDate: future,
      plannedStart: tpl.startTime,
      plannedEnd: tpl.endTime,
      plannedBreakMinutes: tpl.breakMinutes,
      plannedGraceMinutes: tpl.graceMinutes,
      isOffDay: false,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ templates: [tpl], schedules: [sched] });
    await expect(service.deactivateTemplate(db, adminActor, tpl.id)).rejects.toMatchObject({
      code: "SHIFT_TEMPLATE_IN_USE",
    });
  });

  it("succeeds when no future SCHEDULED rows reference the template", async () => {
    const tpl = makeTpl();
    const db = makeDb({ templates: [tpl] });
    const row = await service.deactivateTemplate(db, adminActor, tpl.id);
    expect(row.isActive).toBe(false);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WORKSHIFT_DEACTIVATED" }),
    );
  });
});

// ─── Bulk roster create ───────────────────────────────────────────────────────

describe("shift.service.createBulkSchedule", () => {
  it("snapshots the template's planned fields onto each created row", async () => {
    const tpl = makeTpl({
      startTime: "09:00",
      endTime: "17:00",
      breakMinutes: 60,
      graceMinutes: 15,
    });
    const emp = makeEmp({ id: "emp-1" });
    const db = makeDb({ templates: [tpl], employees: [emp] });
    const result = await service.createBulkSchedule(db, adminActor, {
      entries: [
        {
          employeeId: emp.id,
          workShiftId: tpl.id,
          scheduledDate: new Date("2026-06-01T00:00:00Z"),
        } as never,
      ],
    } as never);
    expect(result.conflicts).toHaveLength(0);
    expect(result.created).toHaveLength(1);
    const created = result.created[0] as Record<string, unknown>;
    expect(created.plannedStart).toBe("09:00");
    expect(created.plannedEnd).toBe("17:00");
    expect(created.plannedBreakMinutes).toBe(60);
    expect(created.plannedGraceMinutes).toBe(15);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SHIFT_SCHEDULE_BULK_CREATED" }),
    );
  });

  it("rejects entries for terminated employees as conflicts, not as errors", async () => {
    const tpl = makeTpl();
    const active = makeEmp({ id: "emp-1" });
    const terminated = makeEmp({
      id: "emp-2",
      employmentStatus: "TERMINATED",
    });
    const db = makeDb({
      templates: [tpl],
      employees: [active, terminated],
    });
    const result = await service.createBulkSchedule(db, adminActor, {
      entries: [
        {
          employeeId: "emp-1",
          workShiftId: tpl.id,
          scheduledDate: new Date("2026-06-01T00:00:00Z"),
        } as never,
        {
          employeeId: "emp-2",
          workShiftId: tpl.id,
          scheduledDate: new Date("2026-06-01T00:00:00Z"),
        } as never,
      ],
    } as never);
    expect(result.created).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      employeeId: "emp-2",
      code: "EMPLOYEE_NOT_SCHEDULABLE",
    });
  });

  it("flags an existing SCHEDULED row as conflict unless overrideExisting=true", async () => {
    const tpl = makeTpl();
    const emp = makeEmp();
    const existing: SchedRow = {
      id: "sched-1",
      tenantId: "tenant-1",
      employeeId: emp.id,
      workShiftId: tpl.id,
      storeId: "store-1",
      scheduledDate: new Date("2026-06-01T00:00:00Z"),
      plannedStart: tpl.startTime,
      plannedEnd: tpl.endTime,
      plannedBreakMinutes: 60,
      plannedGraceMinutes: 15,
      isOffDay: false,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      templates: [tpl],
      employees: [emp],
      schedules: [existing],
    });
    const r1 = await service.createBulkSchedule(db, adminActor, {
      entries: [
        {
          employeeId: emp.id,
          workShiftId: tpl.id,
          scheduledDate: new Date("2026-06-01T00:00:00Z"),
        } as never,
      ],
    } as never);
    expect(r1.created).toHaveLength(0);
    expect(r1.conflicts[0]).toMatchObject({ code: "SCHEDULE_ALREADY_EXISTS" });

    // override
    const r2 = await service.createBulkSchedule(db, adminActor, {
      entries: [
        {
          employeeId: emp.id,
          workShiftId: tpl.id,
          scheduledDate: new Date("2026-06-01T00:00:00Z"),
        } as never,
      ],
      overrideExisting: true,
    } as never);
    expect(r2.created).toHaveLength(1);
    expect(r2.conflicts).toHaveLength(0);
  });

  it("accepts isOffDay rows without a workShiftId and writes planned* as null", async () => {
    const emp = makeEmp();
    const db = makeDb({ employees: [emp] });
    const result = await service.createBulkSchedule(db, adminActor, {
      entries: [
        {
          employeeId: emp.id,
          scheduledDate: new Date("2026-06-01T00:00:00Z"),
          isOffDay: true,
        } as never,
      ],
    } as never);
    expect(result.conflicts).toHaveLength(0);
    const created = result.created[0] as Record<string, unknown>;
    expect(created.isOffDay).toBe(true);
    expect(created.plannedStart).toBeNull();
    expect(created.workShiftId).toBeNull();
  });

  it("never rewrites a COMPLETED row — returns SCHEDULE_LOCKED conflict", async () => {
    const tpl = makeTpl();
    const emp = makeEmp();
    const completed: SchedRow = {
      id: "sched-c",
      tenantId: "tenant-1",
      employeeId: emp.id,
      workShiftId: tpl.id,
      storeId: "store-1",
      scheduledDate: new Date("2026-04-01T00:00:00Z"),
      plannedStart: "09:00",
      plannedEnd: "17:00",
      plannedBreakMinutes: 60,
      plannedGraceMinutes: 15,
      isOffDay: false,
      status: "COMPLETED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      templates: [tpl],
      employees: [emp],
      schedules: [completed],
    });
    const result = await service.createBulkSchedule(db, adminActor, {
      entries: [
        {
          employeeId: emp.id,
          workShiftId: tpl.id,
          scheduledDate: new Date("2026-04-01T00:00:00Z"),
        } as never,
      ],
      overrideExisting: true,
    } as never);
    expect(result.created).toHaveLength(0);
    expect(result.conflicts[0]).toMatchObject({ code: "SCHEDULE_LOCKED" });
  });
});

// ─── resolveScheduledShift — the FROZEN contract ──────────────────────────────

describe("shift.service.resolveScheduledShift", () => {
  it("returns null when no schedule exists (graceful degradation per §13)", async () => {
    const db = makeDb();
    const out = await service.resolveScheduledShift(
      db,
      null,
      "emp-1",
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(out).toBeNull();
  });

  it("returns the SNAPSHOT, not a live WorkShift join", async () => {
    const tpl = makeTpl({ startTime: "08:00", endTime: "16:00" });
    const sched: SchedRow = {
      id: "sched-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: tpl.id,
      storeId: "store-1",
      scheduledDate: new Date(Date.UTC(2026, 5, 1)),
      plannedStart: "09:00", // SNAPSHOT (template was "08:00" but snapshot wins)
      plannedEnd: "17:00",
      plannedBreakMinutes: 45,
      plannedGraceMinutes: 5,
      isOffDay: false,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ templates: [tpl], schedules: [sched] });
    const out = await service.resolveScheduledShift(
      db,
      null,
      "emp-1",
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(out).not.toBeNull();
    expect(out!.startTime).toBe("09:00"); // snapshot
    expect(out!.endTime).toBe("17:00");
    expect(out!.breakMinutes).toBe(45);
    expect(out!.graceMinutes).toBe(5);
    expect(out!.crossesMidnight).toBe(false);
  });

  it("returns isOffDay=true when the row is an explicit off-day", async () => {
    const sched: SchedRow = {
      id: "sched-off",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: null,
      storeId: null,
      scheduledDate: new Date(Date.UTC(2026, 5, 2)),
      plannedStart: null,
      plannedEnd: null,
      plannedBreakMinutes: 0,
      plannedGraceMinutes: 0,
      isOffDay: true,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ schedules: [sched] });
    const out = await service.resolveScheduledShift(
      db,
      null,
      "emp-1",
      new Date("2026-06-02T00:00:00Z"),
    );
    expect(out!.isOffDay).toBe(true);
    expect(out!.startTime).toBeNull();
    expect(out!.endTime).toBeNull();
  });

  it("returns null for a CANCELLED row (treated as no schedule)", async () => {
    const sched: SchedRow = {
      id: "sched-x",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: null,
      storeId: null,
      scheduledDate: new Date(Date.UTC(2026, 5, 3)),
      plannedStart: "09:00",
      plannedEnd: "17:00",
      plannedBreakMinutes: 0,
      plannedGraceMinutes: 0,
      isOffDay: false,
      status: "CANCELLED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ schedules: [sched] });
    const out = await service.resolveScheduledShift(
      db,
      null,
      "emp-1",
      new Date("2026-06-03T00:00:00Z"),
    );
    expect(out).toBeNull();
  });

  it("reports crossesMidnight=true when plannedEnd < plannedStart", async () => {
    const sched: SchedRow = {
      id: "sched-n",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: "tpl-n",
      storeId: null,
      scheduledDate: new Date(Date.UTC(2026, 5, 4)),
      plannedStart: "22:00",
      plannedEnd: "06:00",
      plannedBreakMinutes: 30,
      plannedGraceMinutes: 10,
      isOffDay: false,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ schedules: [sched] });
    const out = await service.resolveScheduledShift(
      db,
      null,
      "emp-1",
      new Date("2026-06-04T00:00:00Z"),
    );
    expect(out!.crossesMidnight).toBe(true);
    expect(out!.startTime).toBe("22:00");
    expect(out!.endTime).toBe("06:00");
  });
});

// ─── updateSchedule — snapshot re-write on workShiftId change ──────────────────

describe("shift.service.updateSchedule", () => {
  it("re-snapshots planned* when workShiftId changes", async () => {
    const oldTpl = makeTpl({
      id: "tpl-old",
      code: "OLD",
      startTime: "09:00",
      endTime: "17:00",
    });
    const newTpl = makeTpl({
      id: "tpl-new",
      code: "NEW",
      startTime: "13:00",
      endTime: "21:00",
      breakMinutes: 30,
      graceMinutes: 5,
    });
    const sched: SchedRow = {
      id: "sched-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: oldTpl.id,
      storeId: "store-1",
      scheduledDate: new Date(Date.UTC(2026, 5, 10)),
      plannedStart: "09:00",
      plannedEnd: "17:00",
      plannedBreakMinutes: 60,
      plannedGraceMinutes: 15,
      isOffDay: false,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({
      templates: [oldTpl, newTpl],
      schedules: [sched],
    });
    const updated = await service.updateSchedule(db, adminActor, sched.id, {
      workShiftId: newTpl.id,
    } as never);
    expect(updated.workShiftId).toBe(newTpl.id);
    expect(updated.plannedStart).toBe("13:00");
    expect(updated.plannedEnd).toBe("21:00");
    expect(updated.plannedBreakMinutes).toBe(30);
    expect(updated.plannedGraceMinutes).toBe(5);
  });

  it("rejects edits to COMPLETED rows (immutable history)", async () => {
    const sched: SchedRow = {
      id: "sched-c",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: "tpl-1",
      storeId: "store-1",
      scheduledDate: new Date(Date.UTC(2026, 3, 1)),
      plannedStart: "09:00",
      plannedEnd: "17:00",
      plannedBreakMinutes: 60,
      plannedGraceMinutes: 15,
      isOffDay: false,
      status: "COMPLETED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ schedules: [sched] });
    await expect(
      service.updateSchedule(db, adminActor, sched.id, {
        notes: "tweak",
      } as never),
    ).rejects.toThrow(/immutable history/);
  });
});

// ─── cancelSchedule ───────────────────────────────────────────────────────────

describe("shift.service.cancelSchedule", () => {
  it("flips a SCHEDULED row to CANCELLED, writes audit, does not hard-delete", async () => {
    const sched: SchedRow = {
      id: "sched-1",
      tenantId: "tenant-1",
      employeeId: "emp-1",
      workShiftId: "tpl-1",
      storeId: "store-1",
      scheduledDate: new Date(Date.UTC(2026, 5, 5)),
      plannedStart: "09:00",
      plannedEnd: "17:00",
      plannedBreakMinutes: 60,
      plannedGraceMinutes: 15,
      isOffDay: false,
      status: "SCHEDULED",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb({ schedules: [sched] });
    const row = await service.cancelSchedule(db, adminActor, sched.id);
    expect(row.status).toBe("CANCELLED");
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SHIFT_SCHEDULE_DELETED" }),
    );
  });
});

// ─── List scoping ─────────────────────────────────────────────────────────────

describe("shift.service.listSchedules scope enforcement", () => {
  it("EMPLOYEE without scope=self defaults to self and 409s when not linked", async () => {
    const db = makeDb({ employees: [] }); // no employee linked
    await expect(
      service.listSchedules(db, employeeActor, {
        page: 1,
        limit: 20,
        sortOrder: "asc",
      } as never),
    ).rejects.toMatchObject({ code: "NO_LINKED_EMPLOYEE" });
  });

  it("MANAGER cannot request scope=all", async () => {
    const me = makeEmp({ id: "mgr-emp", userId: "mgr-1", reportsToId: null });
    const db = makeDb({ employees: [me] });
    await expect(
      service.listSchedules(db, managerActor, {
        page: 1,
        limit: 20,
        sortOrder: "asc",
        scope: "all",
      } as never),
    ).rejects.toThrow(/Missing scope: all/);
  });
});
