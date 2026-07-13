// Unit tests for the payroll service No database required.
//
// Coverage:
//   * createSalaryStructure — happy path
//   * createSalaryStructure — duplicate code rejected
//   * createPayrollRun — happy path
//   * createPayrollRun — duplicate period blocked
//   * approvePayrollRun — SOD_VIOLATION when same person processes and approves
//   * approvePayrollRun — success when different actors
//   * approvePayrollRun — wrong status rejected
//   * cancelPayrollRun — APPROVED runs cannot be cancelled
//   * voidPayslip — DRAFT payslip cannot be voided
//   * voidPayslip — FINALIZED payslip can be voided
//   * getPayslip (ownOnly=true) — employee can see own payslip
//   * getPayslip (ownOnly=true) — employee cannot see another employee's payslip
//   * assignEmployeeSalary — supersedes prior active salary
//   * Tenant isolation: different tenantId returns 404

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../modules/audit/audit.service", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../leave/leave.service", () => ({
  getPaidUnpaidLeaveDays: vi.fn().mockResolvedValue({ paidDays: 0, unpaidDays: 0, byType: [] }),
}));

import * as service from "../payroll.service";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthorizationError,
} from "../../../shared/errors";

type MockFn = ReturnType<typeof vi.fn>;

interface MockDb {
  salaryStructure: { findFirst: MockFn; create: MockFn; update: MockFn };
  salaryComponent: { findFirst: MockFn; create: MockFn };
  payrollRun: {
    findFirst: MockFn;
    findFirstOrThrow: MockFn;
    create: MockFn;
    update: MockFn;
    updateMany: MockFn;
  };
  payslip: {
    findFirst: MockFn;
    findFirstOrThrow: MockFn;
    create: MockFn;
    update: MockFn;
    updateMany: MockFn;
    findMany: MockFn;
  };
  payslipLine: { deleteMany: MockFn; createMany: MockFn };
  employeeSalary: { findFirst: MockFn; create: MockFn; update: MockFn };
  employee: { findMany: MockFn; findFirst: MockFn };
  attendanceRecord: { findMany: MockFn };
  salaryAdvance: { findFirst: MockFn };
  $transaction: MockFn;
}

function makeDb(overrides: Partial<MockDb> = {}): MockDb {
  return {
    salaryStructure: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    salaryComponent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    payrollRun: {
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    payslip: {
      findFirst: vi.fn().mockResolvedValue(null),
      findFirstOrThrow: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    payslipLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    employeeSalary: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    employee: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    attendanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
    salaryAdvance: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
      cb({
        payslip: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        payrollRun: { update: vi.fn() },
        employee: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }),
    ),
    ...overrides,
  };
}

const actor = { id: "user-1", tenantId: "tenant-1", role: "HR_MANAGER", employeeId: "emp-1" };

// ─── Salary Structures ─────────────────────────────────────────────────────────

describe("createSalaryStructure", () => {
  it("creates a salary structure successfully", async () => {
    const db = makeDb({
      salaryStructure: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "struct-1",
          tenantId: actor.tenantId,
          name: "Monthly Salary",
          code: "MONTHLY",
          countryCode: null,
          isActive: true,
        }),
        update: vi.fn(),
      },
    });
    const result = await service.createSalaryStructure(db as any, actor, {
      name: "Monthly Salary",
      code: "MONTHLY",
    });
    expect(result.code).toBe("MONTHLY");
  });

  it("throws ConflictError on duplicate code", async () => {
    const db = makeDb({
      salaryStructure: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing" }),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    await expect(
      service.createSalaryStructure(db as any, actor, { name: "Dup", code: "DUP" }),
    ).rejects.toThrow(ConflictError);
  });
});

// ─── Payroll Runs ──────────────────────────────────────────────────────────────

describe("createPayrollRun", () => {
  it("creates a run for a new period", async () => {
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        findFirstOrThrow: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: actor.tenantId,
          status: "DRAFT",
          name: "May 2026",
          periodStart: new Date("2026-05-01"),
          periodEnd: new Date("2026-05-31"),
        }),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    const result = await service.createPayrollRun(db as any, actor, {
      name: "May 2026",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      payCycle: "MONTHLY",
      storeId: null,
    });
    expect(result.status).toBe("DRAFT");
  });

  it("throws ConflictError when period overlaps an existing active run", async () => {
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-existing",
          status: "REVIEW",
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(
      service.createPayrollRun(db as any, actor, {
        name: "May 2026",
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
        payCycle: "MONTHLY",
        storeId: null,
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("approvePayrollRun", () => {
  it("throws AuthorizationError (SOD_VIOLATION) when same person processes and approves", async () => {
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: actor.tenantId,
          status: "REVIEW",
          processedById: actor.id, // same actor!
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(service.approvePayrollRun(db as any, actor, "run-1")).rejects.toThrow(
      AuthorizationError,
    );
  });

  it("transitions to APPROVED when different actors", async () => {
    const approver = { ...actor, id: "user-2" };
    const transactionFn = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        payslip: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
        payrollRun: { update: vi.fn() },
        employee: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      }),
    );
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: approver.tenantId,
          status: "REVIEW",
          processedById: "user-1", // different from approver
        }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "run-1", status: "APPROVED" }),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      payslip: {
        findFirst: vi.fn().mockResolvedValue(null),
        findFirstOrThrow: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: "ps-1" }, { id: "ps-2" }]),
      },
      $transaction: transactionFn,
    });
    const result = await service.approvePayrollRun(db as any, approver, "run-1");
    expect(result.status).toBe("APPROVED");
  });

  it("clears finalSettlementPending for employees settled in this run (OI-040)", async () => {
    const approver = { ...actor, id: "user-2" };
    const employeeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transactionFn = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        payslip: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        payrollRun: { update: vi.fn() },
        employee: { updateMany: employeeUpdateMany },
      }),
    );
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: approver.tenantId,
          status: "REVIEW",
          processedById: "user-1",
        }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "run-1", status: "APPROVED" }),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      payslip: {
        findFirst: vi.fn().mockResolvedValue(null),
        findFirstOrThrow: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: "ps-1" }]),
      },
      $transaction: transactionFn,
    });

    await service.approvePayrollRun(db as any, approver, "run-1");

    expect(employeeUpdateMany).toHaveBeenCalledTimes(1);
    const arg = employeeUpdateMany.mock.calls[0]![0] as {
      where: { finalSettlementPending: boolean; payslips: { some: { payrollRunId: string } } };
      data: { finalSettlementPending: boolean };
    };
    expect(arg.where.finalSettlementPending).toBe(true);
    expect(arg.where.payslips.some.payrollRunId).toBe("run-1");
    expect(arg.data.finalSettlementPending).toBe(false);
  });

  it("throws ValidationError if status is not REVIEW", async () => {
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: actor.tenantId,
          status: "DRAFT",
          processedById: "other-user",
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(service.approvePayrollRun(db as any, actor, "run-1")).rejects.toThrow(
      ValidationError,
    );
  });
});

describe("cancelPayrollRun", () => {
  it("throws ValidationError when trying to cancel an APPROVED run", async () => {
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: actor.tenantId,
          status: "APPROVED",
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    });
    await expect(service.cancelPayrollRun(db as any, actor, "run-1")).rejects.toThrow(
      ValidationError,
    );
  });

  it("cancels a DRAFT run successfully", async () => {
    const db = makeDb({
      payrollRun: {
        findFirst: vi.fn().mockResolvedValue({
          id: "run-1",
          tenantId: actor.tenantId,
          status: "DRAFT",
        }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "run-1", status: "CANCELLED" }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
      },
    });
    const result = await service.cancelPayrollRun(db as any, actor, "run-1");
    expect(result.status).toBe("CANCELLED");
  });
});

// ─── Payslips ──────────────────────────────────────────────────────────────────

describe("voidPayslip", () => {
  it("throws ValidationError when voiding a non-FINALIZED payslip", async () => {
    const db = makeDb({
      payslip: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ps-1",
          tenantId: actor.tenantId,
          status: "DRAFT",
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    });
    await expect(
      service.voidPayslip(db as any, actor, "ps-1", { reason: "mistake" }),
    ).rejects.toThrow(ValidationError);
  });

  it("voids a FINALIZED payslip successfully", async () => {
    const db = makeDb({
      payslip: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ps-1",
          tenantId: actor.tenantId,
          status: "FINALIZED",
        }),
        findFirstOrThrow: vi.fn().mockResolvedValue({ id: "ps-1", status: "VOIDED", lines: [] }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    });
    const result = await service.voidPayslip(db as any, actor, "ps-1", { reason: "corrected" });
    expect(result.status).toBe("VOIDED");
  });
});

describe("getPayslip with ownOnly", () => {
  it("employee can see their own payslip", async () => {
    const db = makeDb({
      payslip: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ps-1",
          tenantId: actor.tenantId,
          employeeId: "emp-1", // matches actor.employeeId
          status: "FINALIZED",
          lines: [],
          employee: { id: "emp-1", firstName: "Jane", lastName: "Doe", employeeCode: "E001" },
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    });
    const result = await service.getPayslip(db as any, actor, "ps-1", true);
    expect(result.employeeId).toBe("emp-1");
  });

  it("employee cannot see another employee's payslip", async () => {
    const db = makeDb({
      payslip: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ps-2",
          tenantId: actor.tenantId,
          employeeId: "emp-99", // different employee
          status: "FINALIZED",
          lines: [],
          employee: { id: "emp-99", firstName: "Bob", lastName: "Smith", employeeCode: "E099" },
        }),
        findFirstOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
    });
    await expect(service.getPayslip(db as any, actor, "ps-2", true)).rejects.toThrow(
      AuthorizationError,
    );
  });
});

// ─── Employee Salary Assignment ────────────────────────────────────────────────

describe("assignEmployeeSalary", () => {
  it("supersedes prior active salary", async () => {
    const existingSalary = {
      id: "sal-old",
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
    };
    const newSalary = {
      id: "sal-new",
      employeeId: "emp-1",
      basicPay: { toString: () => "60000" },
      currency: "USD",
      effectiveFrom: new Date("2026-05-01"),
      effectiveTo: null,
      supersededById: "sal-old",
    };
    const transactionFn = vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({
        employeeSalary: {
          findFirst: vi.fn().mockResolvedValue(existingSalary),
          update: vi
            .fn()
            .mockResolvedValue({ ...existingSalary, effectiveTo: new Date("2026-04-30") }),
          create: vi.fn().mockResolvedValue(newSalary),
        },
      }),
    );
    const db = makeDb({
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: "emp-1", tenantId: "tenant-1" }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      salaryStructure: {
        findFirst: vi.fn().mockResolvedValue({ id: "struct-1", isActive: true }),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: transactionFn,
    });
    const result = await service.assignEmployeeSalary(db as any, actor, {
      employeeId: "emp-1",
      salaryStructureId: "struct-1",
      basicPay: "60000",
      currency: "USD",
      effectiveFrom: "2026-05-01",
    });
    expect(result.supersededById).toBe("sal-old");
  });
});

// ─── Tenant isolation ─────────────────────────────────────────────────────────

describe("Tenant isolation", () => {
  it("getSalaryStructure returns 404 for wrong tenant", async () => {
    const db = makeDb({
      salaryStructure: {
        findFirst: vi.fn().mockResolvedValue(null), // not found for this tenant
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    const wrongTenantActor = { ...actor, tenantId: "tenant-other" };
    await expect(
      service.getSalaryStructure(db as any, wrongTenantActor, "struct-1"),
    ).rejects.toThrow(NotFoundError);
  });
});
