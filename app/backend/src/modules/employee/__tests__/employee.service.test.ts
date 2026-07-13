import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Phase 19a: the employee service now imports `prisma` from
// `../../../config/database` to run `$transaction(tx)` for the
// createUser / linkUser flows. The raw client tries to connect at
// module load when `DATABASE_URL` is unset (test env), so we mock
// the module here. The mock implementation is wired per-test where
// the createUser / linkUser branches are exercised; happy-path tests
// of the basic CRUD flow use only the tenant-scoped `db` mock and
// don't reach into `prisma.$transaction`.
const { prismaTxMock } = vi.hoisted(() => ({
  prismaTxMock: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  } as { $transaction: ReturnType<typeof vi.fn> },
}));
vi.mock("../../../config/database", () => ({
  prisma: prismaTxMock,
}));

import * as service from "../employee.service";
import { writeAuditLog } from "../../../modules/audit/audit.service";

const writeMock = writeAuditLog as unknown as ReturnType<typeof vi.fn>;

interface EmployeeRow {
  id: string;
  tenantId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  email: string | null;
  phone: string | null;
  departmentId: string;
  designationId: string;
  storeId: string | null;
  reportsToId: string | null;
  employmentStatus: string;
  employmentType: string;
  employmentStartDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function makeEmp(overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    id: "emp-1",
    tenantId: "tenant-1",
    employeeCode: "EMP001",
    firstName: "Rahim",
    lastName: "Khan",
    middleName: null,
    email: "r@x.y",
    phone: null,
    departmentId: "dept-1",
    designationId: "des-1",
    storeId: null,
    reportsToId: null,
    employmentStatus: "ACTIVE",
    employmentType: "FULL_TIME",
    employmentStartDate: new Date("2026-05-01T00:00:00Z"),
    isActive: true,
    createdAt: new Date("2026-05-20T00:00:00Z"),
    updatedAt: new Date("2026-05-20T00:00:00Z"),
    ...overrides,
  };
}

interface DbState {
  departments: Array<{ id: string; isActive: boolean }>;
  designations: Array<{ id: string; isActive: boolean }>;
  stores: Array<{ id: string }>;
  employees: EmployeeRow[];
}

function makeDb(state: Partial<DbState> = {}): any {
  const s: DbState = {
    departments: [{ id: "dept-1", isActive: true }],
    designations: [{ id: "des-1", isActive: true }],
    stores: [{ id: "store-1" }],
    employees: [],
    ...state,
  };

  return {
    _state: s,
    department: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where: { id } }) =>
          Promise.resolve(s.departments.find((d) => d.id === id) ?? null),
        ),
    },
    designation: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where: { id } }) =>
          Promise.resolve(s.designations.find((d) => d.id === id) ?? null),
        ),
    },
    store: {
      findUnique: vi
        .fn()
        .mockImplementation(({ where: { id } }) =>
          Promise.resolve(s.stores.find((d) => d.id === id) ?? null),
        ),
    },
    employee: {
      findFirst: vi.fn(),
      findUnique: vi.fn().mockImplementation(({ where: { id }, select }) => {
        const row = s.employees.find((e) => e.id === id) ?? null;
        if (!row) return Promise.resolve(null);
        // The cycle walker selects exactly { reportsToId: true }
        // and nothing else — narrow only in that case.
        if (select && Object.keys(select).length === 1 && select.reportsToId) {
          return Promise.resolve({ reportsToId: row.reportsToId });
        }
        return Promise.resolve(row);
      }),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

// Actor shape widened to carry `role` after Phase 19a (createUser /
// link-user flows) — the service now uses role for the role-clamp
// check on the createUser path. ADMIN passes all clamps so the
// existing happy-path tests are unaffected.
const actor = {
  id: "user-1",
  tenantId: "tenant-1",
  role: "ADMIN",
} as const;

beforeEach(() => writeMock.mockClear());

describe("employee.service.list", () => {
  it("returns paginated active employees by default", async () => {
    const db = makeDb();
    db.employee.findMany.mockResolvedValue([makeEmp()]);
    db.employee.count.mockResolvedValue(1);
    const out = await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
    } as never);
    expect(out.pagination.total).toBe(1);
    const args = db.employee.findMany.mock.calls[0][0];
    expect(args.where.isActive).toBe(true);
    // Detail-only / sensitive-only fields must not leak into the
    // list select. Just verify the select shape doesn't include
    // emergencyContact or address.
    expect(args.select.emergencyContact).toBeUndefined();
    expect(args.select.address).toBeUndefined();
  });

  it("applies filters: department, status, employment type", async () => {
    const db = makeDb();
    db.employee.findMany.mockResolvedValue([]);
    db.employee.count.mockResolvedValue(0);
    await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
      departmentId: "dept-1",
      employmentStatus: "ACTIVE",
      employmentType: "FULL_TIME",
    } as never);
    const w = db.employee.findMany.mock.calls[0][0].where;
    expect(w.departmentId).toBe("dept-1");
    expect(w.employmentStatus).toBe("ACTIVE");
    expect(w.employmentType).toBe("FULL_TIME");
  });

  it("search expands across code, name, email and phone", async () => {
    const db = makeDb();
    db.employee.findMany.mockResolvedValue([]);
    db.employee.count.mockResolvedValue(0);
    await service.list(db, {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortOrder: "desc",
      search: "rahim",
    } as never);
    const or = db.employee.findMany.mock.calls[0][0].where.OR;
    const fields = or.map((o: Record<string, unknown>) => Object.keys(o)[0]);
    expect(fields).toEqual(
      expect.arrayContaining(["employeeCode", "firstName", "lastName", "email", "phone"]),
    );
  });
});

describe("employee.service.getById", () => {
  it("returns the row when found", async () => {
    const db = makeDb({ employees: [makeEmp()] });
    const out = await service.getById(db, "emp-1");
    expect((out as EmployeeRow).employeeCode).toBe("EMP001");
  });

  it("404 when missing", async () => {
    const db = makeDb();
    await expect(service.getById(db, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("employee.service.create", () => {
  const baseInput = {
    employeeCode: "EMP001",
    firstName: "Rahim",
    lastName: "Khan",
    departmentId: "dept-1",
    designationId: "des-1",
    employmentStartDate: new Date("2026-05-01"),
  };

  it("creates an employee and writes an audit row", async () => {
    const emp = makeEmp();
    const db = makeDb();
    db.employee.findFirst.mockResolvedValue(null);
    db.employee.create.mockResolvedValue(emp);

    const out = await service.create(db, actor, baseInput as never);
    expect((out as EmployeeRow).id).toBe("emp-1");
    expect(db.employee.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: actor.tenantId,
        employeeCode: "EMP001",
        departmentId: "dept-1",
        designationId: "des-1",
        employmentStatus: "ACTIVE",
        employmentType: "FULL_TIME",
      }),
      select: expect.any(Object),
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EMPLOYEE_CREATED",
        entityType: "Employee",
        entityId: "emp-1",
        tenantId: actor.tenantId,
      }),
    );
  });

  it("rejects duplicate employeeCode", async () => {
    const db = makeDb();
    db.employee.findFirst.mockResolvedValue(makeEmp());
    await expect(service.create(db, actor, baseInput as never)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects when department is missing", async () => {
    const db = makeDb({ departments: [] });
    db.employee.findFirst.mockResolvedValue(null);
    await expect(service.create(db, actor, baseInput as never)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects when designation is missing", async () => {
    const db = makeDb({ designations: [] });
    db.employee.findFirst.mockResolvedValue(null);
    await expect(service.create(db, actor, baseInput as never)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects when reports-to manager is missing", async () => {
    const db = makeDb();
    db.employee.findFirst.mockResolvedValue(null);
    db.employee.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
      id === "manager-1" ? Promise.resolve(null) : Promise.resolve(null),
    );
    await expect(
      service.create(db, actor, {
        ...baseInput,
        reportsToId: "manager-1",
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("employee.service.update", () => {
  it("rejects assigning self as manager", async () => {
    const emp = makeEmp();
    const db = makeDb({ employees: [emp] });
    await expect(
      service.update(db, actor, emp.id, {
        reportsToId: emp.id,
      } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects cycles in the reports-to chain", async () => {
    // A reports to B, B reports to A — assigning B as A's manager
    // would close the cycle.
    const a = makeEmp({ id: "A", reportsToId: null });
    const b = makeEmp({ id: "B", reportsToId: "A" });
    const db = makeDb({ employees: [a, b] });
    // Override findUnique to return the right shape for both the
    // pre-check and the cycle walk.
    db.employee.findUnique.mockImplementation(({ where: { id }, select }: any) => {
      const row = [a, b].find((e) => e.id === id);
      if (!row) return Promise.resolve(null);
      if (select && Object.keys(select).length === 1 && select.reportsToId) {
        return Promise.resolve({ reportsToId: row.reportsToId });
      }
      return Promise.resolve(row);
    });
    await expect(
      service.update(db, actor, a.id, { reportsToId: b.id } as never),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects duplicate employeeCode on update", async () => {
    const emp = makeEmp({ employeeCode: "EMP001" });
    const db = makeDb({ employees: [emp] });
    db.employee.findFirst.mockResolvedValue(makeEmp({ id: "other" }));
    await expect(
      service.update(db, actor, emp.id, {
        employeeCode: "EMP999",
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("applies partial updates and writes audit", async () => {
    const before = makeEmp();
    const after = { ...before, firstName: "Rahima" };
    const db = makeDb({ employees: [before] });
    db.employee.update.mockResolvedValue(after);
    const out = await service.update(db, actor, before.id, {
      firstName: "Rahima",
    } as never);
    expect((out as EmployeeRow).firstName).toBe("Rahima");
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ action: "EMPLOYEE_UPDATED" }));
  });
});

describe("employee.service — separated-employee edit guard", () => {
  const SEPARATED = ["TERMINATED", "RESIGNED", "RETIRED", "DECEASED", "CONTRACT_ENDED"];

  it("update / updateSensitive / updateSalary all refuse a separated employee", async () => {
    for (const status of SEPARATED) {
      const emp = makeEmp({ employmentStatus: status });

      const db1 = makeDb({ employees: [emp] });
      await expect(
        service.update(db1, actor, emp.id, { firstName: "Nope" } as never),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(db1.employee.update).not.toHaveBeenCalled();

      const db2 = makeDb({ employees: [emp] });
      await expect(
        service.updateSensitive(db2, actor, emp.id, {
          nationalId: "X",
        } as never),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      const db3 = makeDb({ employees: [emp] });
      await expect(
        service.updateSalary(db3, actor, emp.id, {
          salaryStructureId: "ss-1",
          basicPay: "1000",
          effectiveFrom: new Date("2026-06-01"),
        } as never),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    }
  });

  it("update() blocks transitioning an ACTIVE employee INTO a terminal status", async () => {
    const emp = makeEmp({ employmentStatus: "ACTIVE" });
    const db = makeDb({ employees: [emp] });
    await expect(
      service.update(db, actor, emp.id, {
        employmentStatus: "TERMINATED",
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Never reached the write — lifecycle change must go via terminate().
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it("update() still allows a non-terminal status change (ACTIVE → ON_LEAVE)", async () => {
    const before = makeEmp({ employmentStatus: "ACTIVE" });
    const db = makeDb({ employees: [before] });
    db.employee.update.mockResolvedValue({
      ...before,
      employmentStatus: "ON_LEAVE",
    });
    const out = await service.update(db, actor, before.id, {
      employmentStatus: "ON_LEAVE",
    } as never);
    expect(out).toBeDefined();
    expect(db.employee.update).toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ action: "EMPLOYEE_UPDATED" }));
  });
});

describe("employee.service.deactivate / restore", () => {
  it("deactivates an active employee", async () => {
    const before = makeEmp();
    const after = { ...before, isActive: false };
    const db = makeDb({ employees: [before] });
    db.employee.update.mockResolvedValue(after);
    const out = await service.deactivate(db, actor, before.id);
    expect((out as EmployeeRow).isActive).toBe(false);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EMPLOYEE_DEACTIVATED" }),
    );
  });

  it("restores an inactive employee", async () => {
    const before = makeEmp({ isActive: false });
    const after = makeEmp({ isActive: true });
    const db = makeDb({ employees: [before] });
    db.employee.update.mockResolvedValue(after);
    const out = await service.restore(db, actor, before.id);
    expect((out as EmployeeRow).isActive).toBe(true);
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EMPLOYEE_REACTIVATED" }),
    );
  });

  it("404 when target missing", async () => {
    const db = makeDb();
    await expect(service.deactivate(db, actor, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// ─── terminate cascade ─────────────────────────────────────

describe("employee.service.terminate", () => {
  function buildTerminateTxMock(emp: EmployeeRow) {
    const tx = {
      employee: {
        update: vi.fn().mockResolvedValue({
          ...emp,
          employmentStatus: "TERMINATED",
          isActive: false,
        }),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
      refreshToken: {
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      leaveRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      shiftSchedule: {
        updateMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
    };
    prismaTxMock.$transaction.mockImplementation(
      async (cb: (innerTx: unknown) => Promise<unknown>) => cb(tx),
    );
    return tx;
  }

  it("runs the full cascade and records the summary on the result", async () => {
    const emp = makeEmp({ id: "emp-x" });
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      userId: "user-x",
      employmentStatus: "ACTIVE",
    });
    const tx = buildTerminateTxMock(emp);

    const out = await service.terminate(db, actor, emp.id, {
      employmentEndDate: new Date("2026-06-30"),
      separationReason: "RESIGNATION",
      separationNotes: "Moving abroad",
      deactivateUser: true,
      cancelApprovedFutureLeave: false,
    } as never);

    // Cascade summary surfaces in response.
    const o = out as { cascadeSummary: TerminationCascadeSummary };
    expect(o.cascadeSummary.deactivatedUserId).toBe("user-x");
    expect(o.cascadeSummary.refreshTokensRevoked).toBe(2);
    expect(o.cascadeSummary.leaveRequestsCancelled).toBe(3);
    expect(o.cascadeSummary.shiftSchedulesCancelled).toBe(4);

    // Tx steps in the documented order.
    expect(tx.employee.update).toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-x" },
      data: { isActive: false },
    });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-x" },
    });
    expect(tx.leaveRequest.updateMany).toHaveBeenCalled();
    const leaveCall = tx.leaveRequest.updateMany.mock.calls[0]![0];
    // Default: only PENDING cancelled.
    expect(leaveCall.where.status.in).toEqual(["PENDING"]);
    expect(tx.shiftSchedule.updateMany).toHaveBeenCalled();
    // Audit verb + redaction.
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EMPLOYEE_TERMINATED" }),
    );
    const auditCall = writeMock.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "EMPLOYEE_TERMINATED",
    )!;
    const auditNew = (auditCall[0] as { newData: { fieldsRedacted: string[] } }).newData;
    expect(auditNew.fieldsRedacted).toContain("separationNotes");
  });

  it("queues a final settlement (finalSettlementPending) on the employee row", async () => {
    const emp = makeEmp({ id: "emp-x" });
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      userId: null,
      employmentStatus: "ACTIVE",
    });
    const tx = buildTerminateTxMock(emp);

    await service.terminate(db, actor, emp.id, {
      employmentEndDate: new Date("2026-06-30"),
      separationReason: "TERMINATION",
      deactivateUser: false,
    } as never);

    const updateData = (
      tx.employee.update.mock.calls[0]![0] as {
        data: { finalSettlementPending?: boolean; isActive?: boolean };
      }
    ).data;
    expect(updateData.finalSettlementPending).toBe(true);
    expect(updateData.isActive).toBe(false);
  });

  it("skips user deactivation when no linked user", async () => {
    const emp = makeEmp({ id: "emp-x" });
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      userId: null,
      employmentStatus: "ACTIVE",
    });
    const tx = buildTerminateTxMock(emp);

    const out = await service.terminate(db, actor, emp.id, {
      employmentEndDate: new Date("2026-06-30"),
      separationReason: "CONTRACT_END",
      deactivateUser: true,
    } as never);

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
    const o = out as { cascadeSummary: TerminationCascadeSummary };
    expect(o.cascadeSummary.deactivatedUserId).toBeNull();
    expect(o.cascadeSummary.refreshTokensRevoked).toBe(0);
  });

  it("cancelApprovedFutureLeave widens the leave-cancel predicate", async () => {
    const emp = makeEmp({ id: "emp-x" });
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      userId: "user-x",
      employmentStatus: "ACTIVE",
    });
    const tx = buildTerminateTxMock(emp);

    await service.terminate(db, actor, emp.id, {
      employmentEndDate: new Date("2026-06-30"),
      separationReason: "TERMINATION",
      deactivateUser: false,
      cancelApprovedFutureLeave: true,
    } as never);

    const leaveCall = tx.leaveRequest.updateMany.mock.calls[0]![0];
    expect(leaveCall.where.status.in).toEqual(["PENDING", "APPROVED"]);
  });

  it("409 when already terminated", async () => {
    const emp = makeEmp({ id: "emp-x" });
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      userId: null,
      employmentStatus: "TERMINATED",
    });
    await expect(
      service.terminate(db, actor, emp.id, {
        employmentEndDate: new Date("2026-06-30"),
        separationReason: "OTHER",
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps each separation reason to the matching terminal status", async () => {
    const cases: Array<[string, string]> = [
      ["RESIGNATION", "RESIGNED"],
      ["RETIREMENT", "RETIRED"],
      ["TERMINATION", "TERMINATED"],
      ["CONTRACT_END", "CONTRACT_ENDED"],
      ["DECEASED", "DECEASED"],
      ["REDUNDANCY", "TERMINATED"],
      ["ABSCONDED", "TERMINATED"],
      ["OTHER", "TERMINATED"],
    ];
    for (const [reason, expected] of cases) {
      const emp = makeEmp({ id: "emp-x" });
      const db = makeDb({ employees: [emp] });
      db.employee.findUnique.mockResolvedValue({
        ...emp,
        userId: null,
        employmentStatus: "ACTIVE",
      });
      const tx = buildTerminateTxMock(emp);
      writeMock.mockClear();

      await service.terminate(db, actor, emp.id, {
        employmentEndDate: new Date("2026-06-30"),
        separationReason: reason,
        deactivateUser: false,
      } as never);

      // Persisted status matches the reason (not hardcoded TERMINATED).
      const updateData = tx.employee.update.mock.calls[0]![0].data;
      expect(updateData.employmentStatus).toBe(expected);

      // Audit newData reflects the same terminal status.
      const auditCall = writeMock.mock.calls.find(
        (c) => (c[0] as { action: string }).action === "EMPLOYEE_TERMINATED",
      )!;
      expect(
        (auditCall[0] as { newData: { employmentStatus: string } }).newData.employmentStatus,
      ).toBe(expected);
    }
  });

  it("409 when already separated via a non-TERMINATED terminal status (RESIGNED)", async () => {
    const emp = makeEmp({ id: "emp-x" });
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      userId: null,
      employmentStatus: "RESIGNED",
    });
    await expect(
      service.terminate(db, actor, emp.id, {
        employmentEndDate: new Date("2026-06-30"),
        separationReason: "TERMINATION",
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

// Local type alias mirroring the one in employee.service.ts so the
// test can assert on its shape without importing it.
interface TerminationCascadeSummary {
  deactivatedUserId: string | null;
  refreshTokensRevoked: number;
  leaveRequestsCancelled: number;
  shiftSchedulesCancelled: number;
}

// ─── createUser + linkUser ─────────────────────────────────
//
// These tests exercise the two paths that turn an Employee record into
// something the person can actually log in with. The raw prisma client
// (and its `$transaction`) is the hoisted mock at the top of the file;
// per-test we wire its `$transaction` to invoke the callback against a
// per-test `tx` mock so we can assert exactly which calls happen
// inside the atomic block.

const baseCreate = {
  employeeCode: "EMP777",
  firstName: "Linked",
  lastName: "Person",
  departmentId: "dept-1",
  designationId: "des-1",
  storeId: "store-1",
  employmentStartDate: new Date("2026-05-01T00:00:00Z"),
} as const;

function makeTx() {
  return {
    user: {
      create: vi.fn(),
      update: vi.fn(),
    },
    employee: {
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

function wirePrismaTx(tx: ReturnType<typeof makeTx>) {
  // The hoisted prismaTxMock $transaction needs the callback to
  // receive *our* tx mock.
  prismaTxMock.$transaction.mockImplementation(async (cb: (innerTx: unknown) => Promise<unknown>) =>
    cb(tx),
  );
}

describe("employee.service.create — createUser branch", () => {
  it("mints a User + Employee atomically, back-links, and returns a temp password when the operator did not supply one", async () => {
    const db = makeDb({ employees: [] });
    db.employee.findFirst.mockResolvedValue(null);
    db.user = {
      findFirst: vi.fn().mockResolvedValue(null),
    } as never;
    const tx = makeTx();
    const newEmp = makeEmp({ id: "emp-new", employeeCode: "EMP777" });
    tx.user.create.mockResolvedValue({
      id: "user-new",
      email: "linked@x.y",
      role: "EMPLOYEE",
    });
    tx.employee.create.mockResolvedValue(newEmp);
    tx.user.update.mockResolvedValue({});
    wirePrismaTx(tx);

    const out = await service.create(db, actor, {
      ...baseCreate,
      createUser: {
        email: "Linked@X.Y",
        role: "EMPLOYEE",
      },
    } as never);

    // User.create called first, then Employee.create with userId
    // pointing at the new user, then User.update setting employeeId.
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-new" },
      data: { employeeId: "emp-new" },
    });
    // Email lowercased on persist.
    expect(tx.user.create.mock.calls[0]![0].data.email).toBe("linked@x.y");
    // Temp password returned in response.
    expect((out as Record<string, unknown>).user).toMatchObject({
      id: "user-new",
      email: "linked@x.y",
      role: "EMPLOYEE",
    });
    expect(
      ((out as Record<string, unknown>).user as Record<string, unknown>).temporaryPassword,
    ).toEqual(expect.any(String));
    // Two audit verbs: EMPLOYEE_CREATED and USER_CREATED_VIA_HR.
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({ action: "EMPLOYEE_CREATED" }));
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_CREATED_VIA_HR" }),
    );
  });

  it("does NOT return temporaryPassword when the operator supplied one", async () => {
    const db = makeDb();
    db.employee.findFirst.mockResolvedValue(null);
    db.user = { findFirst: vi.fn().mockResolvedValue(null) } as never;
    const tx = makeTx();
    tx.user.create.mockResolvedValue({ id: "u", email: "a@b.c", role: "EMPLOYEE" });
    tx.employee.create.mockResolvedValue(makeEmp({ id: "e" }));
    tx.user.update.mockResolvedValue({});
    wirePrismaTx(tx);

    const out = await service.create(db, actor, {
      ...baseCreate,
      createUser: {
        email: "a@b.c",
        role: "EMPLOYEE",
        password: "supplied-by-operator-99",
      },
    } as never);

    expect(
      ((out as Record<string, unknown>).user as Record<string, unknown>).temporaryPassword,
    ).toBeUndefined();
  });

  it("rejects when the calling role cannot mint the requested role", async () => {
    const db = makeDb();
    db.employee.findFirst.mockResolvedValue(null);
    db.user = { findFirst: vi.fn().mockResolvedValue(null) } as never;
    const hrActor = {
      id: "u",
      tenantId: "tenant-1",
      role: "HR_MANAGER",
    } as const;

    await expect(
      service.create(db, hrActor, {
        ...baseCreate,
        createUser: {
          // HR_MANAGER may only mint CASHIER / EMPLOYEE
          email: "boss@x.y",
          role: "ADMIN",
        } as never,
      } as never),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });
  });

  it("rejects when the email already exists in the tenant", async () => {
    const db = makeDb();
    db.employee.findFirst.mockResolvedValue(null);
    db.user = {
      findFirst: vi.fn().mockResolvedValue({ id: "existing", email: "dup@x.y" }),
    } as never;

    await expect(
      service.create(db, actor, {
        ...baseCreate,
        createUser: { email: "dup@x.y", role: "EMPLOYEE" },
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

// ─── sensitive PII ─────────────────────────────────
//
// Note on mocks: the encryption util is real (uses MASTER_ENCRYPTION_KEY
// from test-env.ts). Tenant key version comes from db.tenant.findUnique
// which we wire on the per-test db mock.

describe("employee.service.updateSensitive", () => {
  function dbWithSensitive(empOverrides: Partial<EmployeeRow> = {}) {
    const emp = makeEmp({
      ...empOverrides,
      // Sensitive ciphertext columns are stored as nullable strings.
    });
    const db = makeDb({ employees: [emp] });
    db.tenant = {
      findUnique: vi.fn().mockResolvedValue({ encryptionKeyVersion: 1 }),
    } as never;
    return { db, emp };
  }

  it("encrypts the supplied fields, updates the row, and returns reveal shape", async () => {
    const { db, emp } = dbWithSensitive();
    // findUnique returns the row WITH the encrypted columns
    // post-update. We mock through the chained behavior:
    // first call (pre-update): no sensitive on file
    // second call inside getById return path: sensitive set
    db.employee.findUnique.mockImplementation(() =>
      Promise.resolve({
        ...emp,
        nationalIdEnc: null,
        passportNumberEnc: null,
        taxIdEnc: null,
        bankDetailsEnc: null,
      }),
    );
    db.employee.update.mockImplementation(({ data }: { data: Record<string, string | null> }) =>
      Promise.resolve({
        ...emp,
        nationalIdEnc: data.nationalIdEnc ?? null,
        passportNumberEnc: data.passportNumberEnc ?? null,
        taxIdEnc: data.taxIdEnc ?? null,
        bankDetailsEnc: data.bankDetailsEnc ?? null,
      }),
    );

    const out = await service.updateSensitive(db, actor, emp.id, {
      nationalId: "1234567890123",
      bankDetails: {
        accountName: "Sara Hossain",
        accountNumber: "AC-001",
        bankName: "BRAC Bank",
      },
    } as never);

    // Wire format checks: ciphertext is base64url and ≠ plaintext.
    const updateCall = db.employee.update.mock.calls[0]![0];
    const writtenNid = updateCall.data.nationalIdEnc as string;
    expect(writtenNid).not.toBe("1234567890123");
    expect(writtenNid).toMatch(/^[A-Za-z0-9_-]+$/);

    // Response reveals plaintext.
    const o = out as unknown as {
      sensitive: { nationalId: string; bankDetails: { accountName: string } };
      sensitiveSummary: { hasNationalId: boolean; hasBankDetails: boolean };
    };
    expect(o.sensitive.nationalId).toBe("1234567890123");
    expect(o.sensitive.bankDetails.accountName).toBe("Sara Hossain");
    expect(o.sensitiveSummary.hasNationalId).toBe(true);
    expect(o.sensitiveSummary.hasBankDetails).toBe(true);

    // Audit verb fires; plaintext is NOT in the audit payload.
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EMPLOYEE_SENSITIVE_UPDATED" }),
    );
    const auditCall = writeMock.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "EMPLOYEE_SENSITIVE_UPDATED",
    )!;
    const newDataStr = JSON.stringify((auditCall[0] as { newData: unknown }).newData);
    expect(newDataStr).not.toContain("1234567890123");
    expect(newDataStr).not.toContain("Sara Hossain");
  });

  it("explicit null clears a field; absent key leaves it untouched", async () => {
    // Use real encryption util so the post-update reveal works
    // when service walks `buildSensitiveReveal`. The existing
    // `nationalIdEnc` must be a valid same-tenant ciphertext.
    const { encryptForTenant } = await import("../../../lib/encryption");
    const existingNidCt = encryptForTenant("KEEP-ME", actor.tenantId, 1);

    const { db, emp } = dbWithSensitive();
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      nationalIdEnc: existingNidCt,
      passportNumberEnc: existingNidCt,
      taxIdEnc: null,
      bankDetailsEnc: null,
    });
    db.employee.update.mockImplementation(({ data }: { data: Record<string, string | null> }) =>
      Promise.resolve({
        ...emp,
        // Only present keys are in data; absent keys stay unchanged.
        nationalIdEnc: existingNidCt,
        passportNumberEnc: data.passportNumberEnc ?? null,
        taxIdEnc: null,
        bankDetailsEnc: null,
      }),
    );

    await service.updateSensitive(db, actor, emp.id, {
      passportNumber: null,
    } as never);

    const updateCall = db.employee.update.mock.calls[0]![0];
    // Only passportNumberEnc in data — nationalIdEnc untouched.
    expect(updateCall.data).toEqual({ passportNumberEnc: null });
  });

  it("404 when employee missing", async () => {
    const db = makeDb({ employees: [] });
    db.tenant = {
      findUnique: vi.fn().mockResolvedValue({ encryptionKeyVersion: 1 }),
    } as never;
    await expect(
      service.updateSensitive(db, actor, "missing", {
        nationalId: "x",
      } as never),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("employee.service.getById — sensitive reveal", () => {
  it("non-revealing call returns sensitiveSummary only (no plaintext)", async () => {
    const emp = makeEmp({});
    const db = makeDb({ employees: [emp] });
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      nationalIdEnc: "ciphertext",
      passportNumberEnc: null,
      taxIdEnc: null,
      bankDetailsEnc: null,
    });
    const out = (await service.getById(db, emp.id)) as unknown as {
      sensitiveSummary: { hasNationalId: boolean };
      sensitive?: unknown;
      nationalIdEnc?: unknown;
    };
    expect(out.sensitive).toBeUndefined();
    expect(out.sensitiveSummary.hasNationalId).toBe(true);
    expect(out.nationalIdEnc).toBeUndefined();
  });

  it("revealing call returns plaintext when ciphertext was written by the same tenant", async () => {
    const emp = makeEmp({});
    const db = makeDb({ employees: [emp] });
    // Use the real encryption util to make a valid ciphertext.
    // Defer import to avoid circular requirements.
    const { encryptForTenant } = await import("../../../lib/encryption");
    const ct = encryptForTenant("REAL-NID-12345", actor.tenantId, 1);
    db.employee.findUnique.mockResolvedValue({
      ...emp,
      nationalIdEnc: ct,
      passportNumberEnc: null,
      taxIdEnc: null,
      bankDetailsEnc: null,
    });
    const out = (await service.getById(db, emp.id, {
      revealSensitive: true,
      tenantId: actor.tenantId,
    })) as unknown as { sensitive: { nationalId: string } };
    expect(out.sensitive.nationalId).toBe("REAL-NID-12345");
  });
});

describe("employee.service.linkUser", () => {
  it("Mode A: links an existing user to an unlinked employee", async () => {
    const target = makeEmp({ id: "emp-1" });
    const db = makeDb({ employees: [target] });
    // overlay user.findUnique to return the candidate user
    db.user = {
      findUnique: vi.fn().mockResolvedValue({
        id: "user-7",
        email: "existing@x.y",
        role: "CASHIER",
        employeeId: null,
        isActive: true,
      }),
    } as never;
    const tx = makeTx();
    tx.employee.update.mockResolvedValue(target);
    tx.user.update.mockResolvedValue({
      id: "user-7",
      email: "existing@x.y",
      role: "CASHIER",
    });
    wirePrismaTx(tx);

    const out = await service.linkUser(db, actor, target.id, {
      userId: "user-7",
    } as never);

    expect(tx.employee.update).toHaveBeenCalledWith({
      where: { id: "emp-1" },
      data: { userId: "user-7" },
      select: expect.any(Object),
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-7" },
      data: { employeeId: "emp-1" },
      select: expect.any(Object),
    });
    expect((out as Record<string, unknown>).user).toMatchObject({
      id: "user-7",
    });
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EMPLOYEE_USER_LINKED" }),
    );
  });

  it("Mode A: 409 when the candidate user is already linked elsewhere", async () => {
    const target = makeEmp({ id: "emp-1" });
    const db = makeDb({ employees: [target] });
    db.user = {
      findUnique: vi.fn().mockResolvedValue({
        id: "user-7",
        email: "x@x.y",
        role: "CASHIER",
        employeeId: "some-other-employee",
        isActive: true,
      }),
    } as never;
    await expect(
      service.linkUser(db, actor, target.id, {
        userId: "user-7",
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("Mode A: 409 when the employee is already linked", async () => {
    const target = makeEmp({ id: "emp-1" });
    // Forge an already-linked employee via direct override of the
    // findUnique result (since our base shape lacks userId).
    const db = makeDb({ employees: [target] });
    db.employee.findUnique = vi
      .fn()
      .mockResolvedValue({ ...target, userId: "already-linked" }) as never;
    await expect(
      service.linkUser(db, actor, target.id, {
        userId: "user-7",
      } as never),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("Mode B: creates a new user and links atomically", async () => {
    const target = makeEmp({ id: "emp-1" });
    const db = makeDb({ employees: [target] });
    db.user = { findFirst: vi.fn().mockResolvedValue(null) } as never;
    const tx = makeTx();
    tx.user.create.mockResolvedValue({
      id: "user-new",
      email: "fresh@x.y",
      role: "EMPLOYEE",
    });
    tx.employee.update.mockResolvedValue(target);
    wirePrismaTx(tx);

    const out = await service.linkUser(db, actor, target.id, {
      createUser: {
        email: "fresh@x.y",
        role: "EMPLOYEE",
      },
    } as never);

    // Mode B creates the user with `employeeId` already populated
    // — no separate back-link call needed.
    expect(tx.user.create.mock.calls[0]![0].data.employeeId).toBe("emp-1");
    expect(tx.employee.update).toHaveBeenCalled();
    expect(
      ((out as Record<string, unknown>).user as Record<string, unknown>).temporaryPassword,
    ).toEqual(expect.any(String));
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EMPLOYEE_USER_LINKED" }),
    );
    expect(writeMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_CREATED_VIA_HR" }),
    );
  });
});
