// HRM Payroll service // Handles: salary structures, components, employee salary assignment,
// payroll runs (state machine), payslip generation + finalization.
//
// Separation of Duties (§12):
//   - approvedById MUST differ from processedById when SoD is enabled.
//   - SoD default: true (reads from Tenant.settings.hr.payrollSoD in v2.1).
//
// Immutability (§13):
//   - FINALIZED payslips cannot be edited or deleted.
//   - Corrections are forward ADJUSTMENT lines in a new run.

import { Prisma } from "../../generated/prisma/client";
import type { TenantPrismaClient } from "../../config/database";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { m } from "../../shared/utils/money";
import { recordAudit } from "../../shared/utils/auditLog";

import { getPreset, listPresets } from "./presets/index";
import { computePayslip, deriveAttendanceFacts } from "./payslip-compute.service";
import {
  buildDateList,
  deriveRange,
  type DerivationEvent,
} from "../attendance/attendance.derivation";
import { getPaidUnpaidLeaveDays } from "../leave/leave.service";
import type {
  ApplyPresetInput,
  EmployeeSalaryAssignInput,
  EmployeeSalaryListInput,
  PayrollRunCreateInput,
  PayrollRunListInput,
  PayslipListInput,
  PayslipVoidInput,
  SalaryComponentCreateInput,
  SalaryComponentUpdateInput,
  SalaryStructureCreateInput,
  SalaryStructureListInput,
  SalaryStructureUpdateInput,
} from "./payroll.validation";
import type { PayrollActor } from "./payroll.types";

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_STANDARD_DAYS = 26;

// ─── Salary Structures ─────────────────────────────────────────────────────────

export async function listSalaryStructures(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: SalaryStructureListInput,
) {
  const extra: Record<string, unknown> = { tenantId: actor.tenantId };
  if (input.isActive !== undefined) extra.isActive = input.isActive;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
    {
      page: input.page,
      limit: input.limit,
      sortBy: "createdAt",
      sortOrder: input.sortDir,
      search: input.search,
    } as never,
    { searchableFields: ["name", "code"], extraWhere: extra },
  );
  const [rows, total] = await Promise.all([
    db.salaryStructure.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { components: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
    }),
    db.salaryStructure.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getSalaryStructure(db: TenantPrismaClient, actor: PayrollActor, id: string) {
  const struct = await db.salaryStructure.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { components: { orderBy: { displayOrder: "asc" } } },
  });
  if (!struct) throw new NotFoundError("Salary structure not found");
  return struct;
}

export async function createSalaryStructure(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: SalaryStructureCreateInput,
) {
  const existing = await db.salaryStructure.findFirst({
    where: { tenantId: actor.tenantId, code: input.code },
  });
  if (existing) throw new ConflictError("A salary structure with this code already exists");

  const struct = await db.salaryStructure.create({
    data: {
      tenantId: actor.tenantId,
      name: input.name,
      code: input.code,
      countryCode: input.countryCode ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_STRUCTURE_CREATED",
    entityType: "SalaryStructure",
    entityId: struct.id,
    newData: { name: struct.name, code: struct.code },
  });

  return struct;
}

export async function updateSalaryStructure(
  db: TenantPrismaClient,
  actor: PayrollActor,
  id: string,
  input: SalaryStructureUpdateInput,
) {
  const struct = await db.salaryStructure.findFirst({
    where: { id, tenantId: actor.tenantId },
  });
  if (!struct) throw new NotFoundError("Salary structure not found");

  const updated = await db.salaryStructure.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_STRUCTURE_UPDATED",
    entityType: "SalaryStructure",
    entityId: id,
    oldData: { name: struct.name },
    newData: { name: updated.name },
  });

  return updated;
}

export async function deactivateSalaryStructure(
  db: TenantPrismaClient,
  actor: PayrollActor,
  id: string,
) {
  const struct = await db.salaryStructure.findFirst({
    where: { id, tenantId: actor.tenantId },
  });
  if (!struct) throw new NotFoundError("Salary structure not found");
  if (!struct.isActive) throw new ConflictError("Salary structure is already inactive");

  const updated = await db.salaryStructure.update({
    where: { id },
    data: { isActive: false },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_STRUCTURE_DEACTIVATED",
    entityType: "SalaryStructure",
    entityId: id,
    oldData: { isActive: true },
    newData: { isActive: false },
  });

  return updated;
}

// ─── Salary Components ─────────────────────────────────────────────────────────

export async function createSalaryComponent(
  db: TenantPrismaClient,
  actor: PayrollActor,
  structureId: string,
  input: SalaryComponentCreateInput,
) {
  const struct = await db.salaryStructure.findFirst({
    where: { id: structureId, tenantId: actor.tenantId },
  });
  if (!struct) throw new NotFoundError("Salary structure not found");

  const existing = await db.salaryComponent.findFirst({
    where: { tenantId: actor.tenantId, salaryStructureId: structureId, code: input.code },
  });
  if (existing)
    throw new ConflictError("A component with this code already exists in the structure");

  const comp = await db.salaryComponent.create({
    data: {
      tenantId: actor.tenantId,
      salaryStructureId: structureId,
      name: input.name,
      code: input.code,
      type: input.type,
      calcMethod: input.calcMethod,
      fixedAmount: input.fixedAmount ? new Prisma.Decimal(input.fixedAmount) : null,
      percentValue: input.percentValue ? new Prisma.Decimal(input.percentValue) : null,
      formulaKey: input.formulaKey ?? null,
      isTaxable: input.isTaxable,
      displayOrder: input.displayOrder,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_COMPONENT_CREATED",
    entityType: "SalaryComponent",
    entityId: comp.id,
    newData: { code: comp.code, type: comp.type },
  });

  return comp;
}

export async function updateSalaryComponent(
  db: TenantPrismaClient,
  actor: PayrollActor,
  structureId: string,
  componentId: string,
  input: SalaryComponentUpdateInput,
) {
  const comp = await db.salaryComponent.findFirst({
    where: { id: componentId, tenantId: actor.tenantId, salaryStructureId: structureId },
  });
  if (!comp) throw new NotFoundError("Salary component not found");

  const updated = await db.salaryComponent.update({
    where: { id: componentId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.calcMethod !== undefined ? { calcMethod: input.calcMethod } : {}),
      ...(input.fixedAmount !== undefined
        ? { fixedAmount: input.fixedAmount ? new Prisma.Decimal(input.fixedAmount) : null }
        : {}),
      ...(input.percentValue !== undefined
        ? { percentValue: input.percentValue ? new Prisma.Decimal(input.percentValue) : null }
        : {}),
      ...(input.formulaKey !== undefined ? { formulaKey: input.formulaKey } : {}),
      ...(input.isTaxable !== undefined ? { isTaxable: input.isTaxable } : {}),
      ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_COMPONENT_UPDATED",
    entityType: "SalaryComponent",
    entityId: componentId,
    oldData: { name: comp.name, type: comp.type },
    newData: { name: updated.name, type: updated.type },
  });

  return updated;
}

export async function deactivateSalaryComponent(
  db: TenantPrismaClient,
  actor: PayrollActor,
  structureId: string,
  componentId: string,
) {
  const comp = await db.salaryComponent.findFirst({
    where: { id: componentId, tenantId: actor.tenantId, salaryStructureId: structureId },
  });
  if (!comp) throw new NotFoundError("Salary component not found");
  if (!comp.isActive) throw new ConflictError("Component is already inactive");

  const updated = await db.salaryComponent.update({
    where: { id: componentId },
    data: { isActive: false },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_COMPONENT_DEACTIVATED",
    entityType: "SalaryComponent",
    entityId: componentId,
    oldData: { isActive: true },
    newData: { isActive: false },
  });

  return updated;
}

// ─── Country Presets ───────────────────────────────────────────────────────────

export function getCountryPresets() {
  return listPresets();
}

export async function applyCountryPreset(
  db: TenantPrismaClient,
  actor: PayrollActor,
  structureId: string,
  input: ApplyPresetInput,
) {
  const struct = await db.salaryStructure.findFirst({
    where: { id: structureId, tenantId: actor.tenantId },
  });
  if (!struct) throw new NotFoundError("Salary structure not found");

  const preset = getPreset(input.countryCode);
  if (!preset) throw new ValidationError(`Unknown country preset: ${input.countryCode}`);

  const createdComponents = await db.$transaction(async (tx: any) => {
    const created: Array<{ code: string; action: string }> = [];
    for (const presetComp of preset.components) {
      const existing = await tx.salaryComponent.findFirst({
        where: {
          tenantId: actor.tenantId,
          salaryStructureId: structureId,
          code: presetComp.code,
        },
      });
      if (existing) {
        await tx.salaryComponent.update({
          where: { id: existing.id },
          data: {
            name: presetComp.name,
            type: presetComp.type,
            calcMethod: presetComp.calcMethod,
            fixedAmount: presetComp.fixedAmount
              ? new Prisma.Decimal(presetComp.fixedAmount.toFixed(4))
              : null,
            percentValue: presetComp.percentValue
              ? new Prisma.Decimal(presetComp.percentValue.toFixed(2))
              : null,
            formulaKey: presetComp.formulaKey ?? null,
            isTaxable: presetComp.isTaxable,
            displayOrder: presetComp.displayOrder,
            isActive: true,
          },
        });
        created.push({ code: presetComp.code, action: "updated" });
      } else {
        await tx.salaryComponent.create({
          data: {
            tenantId: actor.tenantId,
            salaryStructureId: structureId,
            name: presetComp.name,
            code: presetComp.code,
            type: presetComp.type,
            calcMethod: presetComp.calcMethod,
            fixedAmount: presetComp.fixedAmount
              ? new Prisma.Decimal(presetComp.fixedAmount.toFixed(4))
              : null,
            percentValue: presetComp.percentValue
              ? new Prisma.Decimal(presetComp.percentValue.toFixed(2))
              : null,
            formulaKey: presetComp.formulaKey ?? null,
            isTaxable: presetComp.isTaxable,
            displayOrder: presetComp.displayOrder,
          },
        });
        created.push({ code: presetComp.code, action: "created" });
      }
    }
    await tx.salaryStructure.update({
      where: { id: structureId },
      data: { countryCode: preset.countryCode },
    });
    return created;
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "COUNTRY_PRESET_APPLIED",
    entityType: "SalaryStructure",
    entityId: structureId,
    newData: { countryCode: preset.countryCode, componentsAffected: createdComponents },
  });

  return {
    structureId,
    countryCode: preset.countryCode,
    disclaimer: preset.disclaimer,
    componentsAffected: createdComponents,
  };
}

// ─── Employee Salary Assignment ────────────────────────────────────────────────

export async function listEmployeeSalaries(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: EmployeeSalaryListInput,
) {
  const extra: Record<string, unknown> = { tenantId: actor.tenantId };
  if (input.employeeId) extra.employeeId = input.employeeId;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
    { page: input.page, limit: input.limit, sortBy: "effectiveFrom", sortOrder: "desc" } as never,
    { extraWhere: extra },
  );
  const [rows, total] = await Promise.all([
    db.employeeSalary.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        salaryStructure: true,
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    }),
    db.employeeSalary.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function assignEmployeeSalary(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: EmployeeSalaryAssignInput,
) {
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId, tenantId: actor.tenantId },
  });
  if (!employee) throw new NotFoundError("Employee not found");

  const struct = await db.salaryStructure.findFirst({
    where: { id: input.salaryStructureId, tenantId: actor.tenantId, isActive: true },
  });
  if (!struct) throw new NotFoundError("Salary structure not found or inactive");

  const effectiveFrom = new Date(input.effectiveFrom);

  return db.$transaction(async (tx: any) => {
    const currentActive = await tx.employeeSalary.findFirst({
      where: {
        tenantId: actor.tenantId,
        employeeId: input.employeeId,
        effectiveTo: null,
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (currentActive) {
      if (new Date(currentActive.effectiveFrom) >= effectiveFrom) {
        throw new ValidationError(
          "New salary effective date must be after the current active salary",
        );
      }
      const dayBefore = new Date(effectiveFrom);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      await tx.employeeSalary.update({
        where: { id: currentActive.id },
        data: { effectiveTo: dayBefore },
      });
    }

    const newSalary = await tx.employeeSalary.create({
      data: {
        tenantId: actor.tenantId,
        employeeId: input.employeeId,
        salaryStructureId: input.salaryStructureId,
        basicPay: new Prisma.Decimal(input.basicPay),
        ctc: input.ctc ? new Prisma.Decimal(input.ctc) : null,
        currency: input.currency,
        effectiveFrom,
        supersededById: currentActive?.id ?? null,
      },
    });

    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "EMPLOYEE_SALARY_ASSIGNED",
      entityType: "EmployeeSalary",
      entityId: newSalary.id,
      newData: {
        employeeId: input.employeeId,
        basicPay: input.basicPay,
        effectiveFrom: input.effectiveFrom,
      },
    });

    return newSalary;
  });
}

// ─── Payroll Runs ──────────────────────────────────────────────────────────────

export async function listPayrollRuns(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: PayrollRunListInput,
) {
  const extra: Record<string, unknown> = { tenantId: actor.tenantId };
  if (input.status) extra.status = input.status;
  if (input.storeId) extra.storeId = input.storeId;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
    { page: input.page, limit: input.limit, sortBy: "createdAt", sortOrder: "desc" } as never,
    { extraWhere: extra },
  );
  const [rows, total] = await Promise.all([
    db.payrollRun.findMany({ where, orderBy, skip, take }),
    db.payrollRun.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getPayrollRun(db: TenantPrismaClient, actor: PayrollActor, id: string) {
  const run = await db.payrollRun.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: { _count: { select: { payslips: true } } },
  });
  if (!run) throw new NotFoundError("Payroll run not found");
  return run;
}

export async function createPayrollRun(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: PayrollRunCreateInput,
) {
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);

  const duplicate = await db.payrollRun.findFirst({
    where: {
      tenantId: actor.tenantId,
      status: { notIn: ["CANCELLED", "FAILED"] },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
      ...(input.storeId ? { storeId: input.storeId } : { storeId: null }),
    },
  });
  if (duplicate) {
    throw new ConflictError(
      `A payroll run for the overlapping period already exists (id: ${duplicate.id}, status: ${duplicate.status})`,
    );
  }

  const run = await db.payrollRun.create({
    data: {
      tenantId: actor.tenantId,
      name: input.name,
      periodStart,
      periodEnd,
      payCycle: input.payCycle,
      storeId: input.storeId ?? null,
      status: "DRAFT",
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "PAYROLL_RUN_CREATED",
    entityType: "PayrollRun",
    entityId: run.id,
    newData: { name: run.name, periodStart: input.periodStart, periodEnd: input.periodEnd },
  });

  return run;
}

export async function processPayrollRun(
  db: TenantPrismaClient,
  actor: PayrollActor,
  runId: string,
) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, tenantId: actor.tenantId },
  });
  if (!run) throw new NotFoundError("Payroll run not found");
  if (run.status !== "DRAFT" && run.status !== "FAILED") {
    throw new ValidationError(
      `Cannot process a run in ${run.status} status. Only DRAFT or FAILED runs can be processed.`,
    );
  }

  await db.payrollRun.update({
    where: { id: runId },
    data: {
      status: "PROCESSING",
      processedById: actor.id,
      processedAt: new Date(),
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "PAYROLL_RUN_PROCESSING",
    entityType: "PayrollRun",
    entityId: runId,
    oldData: { status: run.status },
    newData: { status: "PROCESSING" },
  });

  try {
    await _computeAllPayslips(db, actor, run);
    await db.payrollRun.update({
      where: { id: runId },
      data: { status: "REVIEW" },
    });
    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "PAYROLL_RUN_REVIEW",
      entityType: "PayrollRun",
      entityId: runId,
      newData: { status: "REVIEW" },
    });
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err);
    await db.payrollRun.update({
      where: { id: runId },
      data: { status: "FAILED", failureReason },
    });
    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "PAYROLL_RUN_FAILED",
      entityType: "PayrollRun",
      entityId: runId,
      newData: { status: "FAILED", failureReason },
    });
    throw err;
  }

  return db.payrollRun.findFirstOrThrow({ where: { id: runId } });
}

async function _computeAllPayslips(
  db: TenantPrismaClient,
  actor: PayrollActor,
  run: { id: string; tenantId: string; periodStart: Date; periodEnd: Date; storeId: string | null },
) {
  const employees = await db.employee.findMany({
    where: {
      tenantId: run.tenantId,
      ...(run.storeId ? { storeId: run.storeId } : {}),
      // Regular payees (active/probation) plus any separated employee
      // awaiting a final settlement. The latter are inactive
      // with a terminal status, so they only qualify via the flag.
      OR: [
        { isActive: true, employmentStatus: { in: ["ACTIVE", "PROBATION"] } },
        { finalSettlementPending: true },
      ],
    },
  });

  let totalGross = m(0);
  let totalNet = m(0);
  let totalDeductions = m(0);
  let payslipsCreated = 0;

  for (const emp of employees) {
    const salary = await db.employeeSalary.findFirst({
      where: {
        tenantId: run.tenantId,
        employeeId: emp.id,
        // Use the salary row ACTIVE ON periodStart (deep-dive §9.1 /
        // edge case "raise effective mid-period"): a raise taking
        // effect inside the period must NOT change this run — the
        // period-start row governs. Bounding `effectiveFrom` by
        // `periodEnd` (the prior behaviour) wrongly selected the
        // mid-period raise. Mid-period structural proration is v2.1.
        effectiveFrom: { lte: run.periodStart },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.periodStart } }],
      },
      include: {
        salaryStructure: {
          include: {
            components: {
              where: { isActive: true },
              orderBy: { displayOrder: "asc" },
            },
          },
        },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!salary) continue;

    // Fetch attendance events AND the
    // per-day shift schedule for the period, then run the
    // derivation engine to produce day-level facts (PRESENT /
    // HALF_DAY / ABSENT / ON_LEAVE) with late + overtime
    // minutes. Pre-21c this was a conservative mapping that
    // counted every event-day as PRESENT and zeroed late/OT.
    const attendanceRecords = (await db.attendanceRecord.findMany({
      where: {
        employeeId: emp.id,
        occurredAt: {
          gte: run.periodStart,
          lte: new Date(run.periodEnd.getTime() + 86400000),
        },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        eventType: true,
        occurredAt: true,
        isRegularized: true,
      },
    })) as DerivationEvent[];

    const shiftRows = (await db.shiftSchedule.findMany({
      where: {
        employeeId: emp.id,
        scheduledDate: {
          gte: run.periodStart,
          lte: run.periodEnd,
        },
        status: { not: "CANCELLED" as never },
      },
      select: {
        scheduledDate: true,
        isOffDay: true,
        plannedStart: true,
        plannedEnd: true,
        plannedGraceMinutes: true,
      },
    })) as Array<{
      scheduledDate: Date;
      isOffDay: boolean;
      plannedStart: string | null;
      plannedEnd: string | null;
      plannedGraceMinutes: number;
    }>;

    const ctxByDate: Record<
      string,
      {
        shift?: { startsAt: string; endsAt: string; graceMinutesIn?: number };
        isWorkingDay?: boolean;
      }
    > = {};
    for (const r of shiftRows) {
      const iso = r.scheduledDate.toISOString().slice(0, 10);
      if (r.isOffDay) {
        ctxByDate[iso] = { isWorkingDay: false };
        continue;
      }
      if (r.plannedStart && r.plannedEnd) {
        ctxByDate[iso] = {
          shift: {
            startsAt: r.plannedStart,
            endsAt: r.plannedEnd,
            graceMinutesIn: r.plannedGraceMinutes,
          },
        };
      }
    }

    const periodDates = buildDateList(run.periodStart, run.periodEnd);
    const derivedDays = deriveRange(attendanceRecords, ctxByDate, periodDates);

    const { facts: attendanceFacts, flags: attFlags } = deriveAttendanceFacts(
      derivedDays.map((d) => ({
        // DerivedDay.date is "YYYY-MM-DD" (ISO string);
        // deriveAttendanceFacts wants a Date.
        date: new Date(`${d.date}T00:00:00Z`),
        status: d.status,
        workedMinutes: d.workedMinutes ?? null,
        overtimeMinutes: d.overtimeMinutes ?? null,
        lateMinutes: d.lateMinutes ?? null,
      })),
      run.periodStart,
      run.periodEnd,
    );

    // Fetch leave facts (frozen contract)
    const leaveActor = { id: actor.id, tenantId: actor.tenantId, role: actor.role };
    let leaveFacts = { paidDays: 0, unpaidDays: 0 };
    try {
      const leaveResult = await getPaidUnpaidLeaveDays(
        db,
        leaveActor,
        emp.id,
        run.periodStart,
        run.periodEnd,
      );
      leaveFacts = leaveResult;
    } catch {
      attFlags.push("LEAVE_LOOKUP_FAILED");
    }

    // Find pending advance for recovery
    const pendingAdvance = await db.salaryAdvance.findFirst({
      where: {
        tenantId: run.tenantId,
        employeeId: emp.id,
        status: { in: ["DISBURSED", "RECOVERING"] },
      },
      orderBy: { createdAt: "asc" },
    });
    const advanceRecoveryAmount = pendingAdvance
      ? m(pendingAdvance.amountPerInstallment.toString())
      : m(0);

    const components = salary.salaryStructure.components.map((c: any) => ({
      code: c.code,
      name: c.name,
      type: c.type as string,
      calcMethod: c.calcMethod as string,
      fixedAmount: c.fixedAmount ? m(c.fixedAmount.toString()) : null,
      percentValue: c.percentValue ? m(c.percentValue.toString()) : null,
      formulaKey: c.formulaKey as string | null,
      isTaxable: c.isTaxable as boolean,
      displayOrder: c.displayOrder as number,
    }));

    const draft = computePayslip({
      employeeId: emp.id,
      salaryId: salary.id,
      basicPay: m(salary.basicPay.toString()),
      ctc: salary.ctc ? m(salary.ctc.toString()) : null,
      currency: salary.currency,
      structureId: salary.salaryStructureId,
      components,
      periodStart: run.periodStart,
      periodEnd: run.periodEnd,
      standardDays: DEFAULT_STANDARD_DAYS,
      countryCode: salary.salaryStructure.countryCode,
      attendance: attendanceFacts,
      leave: leaveFacts,
      nightDiff: null,
      pendingAdvanceAmount: advanceRecoveryAmount,
      advanceId: pendingAdvance?.id ?? null,
    });

    const combinedFlags = [...attFlags, ...draft.flags];
    // Mark this as the employee's final settlement so HR can
    // distinguish it from a routine payslip on review.
    if (emp.finalSettlementPending) combinedFlags.push("FINAL_SETTLEMENT");

    // Upsert DRAFT payslip (idempotent re-process)
    const existingPayslip = await db.payslip.findFirst({
      where: { tenantId: run.tenantId, payrollRunId: run.id, employeeId: emp.id },
    });

    if (existingPayslip) {
      if (existingPayslip.status !== "DRAFT") continue;
      await db.payslipLine.deleteMany({ where: { payslipId: existingPayslip.id } });
      await db.payslip.update({
        where: { id: existingPayslip.id },
        data: {
          employeeSalaryId: draft.employeeSalaryId,
          grossPay: new Prisma.Decimal(draft.grossPay.toFixed(4)),
          totalDeductions: new Prisma.Decimal(draft.totalDeductions.toFixed(4)),
          netPay: new Prisma.Decimal(draft.netPay.toFixed(4)),
          daysWorked: new Prisma.Decimal(draft.daysWorked.toFixed(2)),
          daysAbsent: new Prisma.Decimal(draft.daysAbsent.toFixed(2)),
          overtimeHours: new Prisma.Decimal(draft.overtimeHours.toFixed(2)),
          flags: combinedFlags,
        },
      });
      await db.payslipLine.createMany({
        data: draft.lines.map((l) => ({
          tenantId: run.tenantId,
          payslipId: existingPayslip.id,
          componentCode: l.componentCode,
          label: l.label,
          type: l.type,
          amount: new Prisma.Decimal(l.amount.toFixed(4)),
          isTaxable: l.isTaxable,
          displayOrder: l.displayOrder,
          meta: l.meta ? (l.meta as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        })),
      });
    } else {
      const newPayslip = await db.payslip.create({
        data: {
          tenantId: run.tenantId,
          payrollRunId: run.id,
          employeeId: emp.id,
          employeeSalaryId: draft.employeeSalaryId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          currency: draft.currency,
          grossPay: new Prisma.Decimal(draft.grossPay.toFixed(4)),
          totalDeductions: new Prisma.Decimal(draft.totalDeductions.toFixed(4)),
          netPay: new Prisma.Decimal(draft.netPay.toFixed(4)),
          daysWorked: new Prisma.Decimal(draft.daysWorked.toFixed(2)),
          daysAbsent: new Prisma.Decimal(draft.daysAbsent.toFixed(2)),
          overtimeHours: new Prisma.Decimal(draft.overtimeHours.toFixed(2)),
          flags: combinedFlags,
          status: "DRAFT",
        },
      });
      await db.payslipLine.createMany({
        data: draft.lines.map((l) => ({
          tenantId: run.tenantId,
          payslipId: newPayslip.id,
          componentCode: l.componentCode,
          label: l.label,
          type: l.type,
          amount: new Prisma.Decimal(l.amount.toFixed(4)),
          isTaxable: l.isTaxable,
          displayOrder: l.displayOrder,
          meta: l.meta ? (l.meta as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        })),
      });
      payslipsCreated++;
    }

    // Record advance recovery
    if (pendingAdvance && advanceRecoveryAmount.gt(0)) {
      const newRecovered = m(pendingAdvance.recoveredAmount.toString()).plus(advanceRecoveryAmount);
      const isSettled = newRecovered.gte(m(pendingAdvance.amount.toString()));
      await db.salaryAdvance.update({
        where: { id: pendingAdvance.id },
        data: {
          recoveredAmount: new Prisma.Decimal(newRecovered.toFixed(4)),
          status: isSettled ? "SETTLED" : "RECOVERING",
        },
      });
    }

    totalGross = totalGross.plus(draft.grossPay);
    totalNet = totalNet.plus(draft.netPay);
    totalDeductions = totalDeductions.plus(draft.totalDeductions);
  }

  await db.payrollRun.update({
    where: { id: run.id },
    data: {
      totalGross: new Prisma.Decimal(totalGross.toFixed(4)),
      totalNet: new Prisma.Decimal(totalNet.toFixed(4)),
      totalDeductions: new Prisma.Decimal(totalDeductions.toFixed(4)),
      employeeCount: payslipsCreated,
    },
  });
}

export async function approvePayrollRun(
  db: TenantPrismaClient,
  actor: PayrollActor,
  runId: string,
) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, tenantId: actor.tenantId },
  });
  if (!run) throw new NotFoundError("Payroll run not found");
  if (run.status !== "REVIEW") {
    throw new ValidationError(`Cannot approve a run in ${run.status} status. Must be REVIEW.`);
  }

  // Separation of Duties: approver must differ from processor (default: true)
  if (run.processedById && run.processedById === actor.id) {
    throw new AuthorizationError(
      "SOD_VIOLATION: The person who processed the payroll run cannot also approve it.",
    );
  }

  const now = new Date();
  await db.$transaction(async (tx: any) => {
    await tx.payslip.updateMany({
      where: { payrollRunId: runId, tenantId: actor.tenantId, status: "DRAFT" },
      data: { status: "FINALIZED", finalizedAt: now },
    });
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: "APPROVED", approvedById: actor.id, approvedAt: now },
    });
    // Once a separated employee's settlement payslip is
    // FINALIZED here, clear the pending flag so they are not re-picked
    // by a later run. Scoped to employees actually settled in this run;
    // a cancelled (never-approved) run leaves the flag set for retry.
    await tx.employee.updateMany({
      where: {
        tenantId: actor.tenantId,
        finalSettlementPending: true,
        payslips: { some: { payrollRunId: runId } },
      },
      data: { finalSettlementPending: false },
    });
  });

  const finalizedPayslips = await db.payslip.findMany({
    where: { payrollRunId: runId, tenantId: actor.tenantId },
  });
  for (const ps of finalizedPayslips) {
    await recordAudit({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: "PAYSLIP_FINALIZED",
      entityType: "Payslip",
      entityId: ps.id,
      newData: { payrollRunId: runId, finalizedAt: now },
    });
  }

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "PAYROLL_RUN_APPROVED",
    entityType: "PayrollRun",
    entityId: runId,
    oldData: { status: "REVIEW" },
    newData: { status: "APPROVED", approvedById: actor.id },
  });

  return db.payrollRun.findFirstOrThrow({ where: { id: runId } });
}

export async function disbursePayrollRun(
  db: TenantPrismaClient,
  actor: PayrollActor,
  runId: string,
) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, tenantId: actor.tenantId },
  });
  if (!run) throw new NotFoundError("Payroll run not found");
  if (run.status !== "APPROVED") {
    throw new ValidationError(`Cannot disburse a run in ${run.status} status. Must be APPROVED.`);
  }

  const now = new Date();
  await db.payrollRun.update({
    where: { id: runId },
    data: { status: "PAID", disbursedById: actor.id, disbursedAt: now },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "PAYROLL_RUN_PAID",
    entityType: "PayrollRun",
    entityId: runId,
    oldData: { status: "APPROVED" },
    newData: { status: "PAID", disbursedById: actor.id },
  });

  return db.payrollRun.findFirstOrThrow({ where: { id: runId } });
}

export async function cancelPayrollRun(
  db: TenantPrismaClient,
  actor: PayrollActor,
  runId: string,
  reason?: string,
) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, tenantId: actor.tenantId },
  });
  if (!run) throw new NotFoundError("Payroll run not found");
  if (!["DRAFT", "REVIEW", "FAILED"].includes(run.status)) {
    throw new ValidationError(
      `Cannot cancel a run in ${run.status} status. Only DRAFT, REVIEW, or FAILED runs can be cancelled.`,
    );
  }

  await db.payrollRun.update({
    where: { id: runId },
    data: { status: "CANCELLED", failureReason: reason ?? null },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "PAYROLL_RUN_CANCELLED",
    entityType: "PayrollRun",
    entityId: runId,
    oldData: { status: run.status },
    newData: { status: "CANCELLED" },
  });

  return db.payrollRun.findFirstOrThrow({ where: { id: runId } });
}

// ─── Payslips ──────────────────────────────────────────────────────────────────

export async function listRunPayslips(
  db: TenantPrismaClient,
  actor: PayrollActor,
  runId: string,
  input: PayslipListInput,
) {
  const run = await db.payrollRun.findFirst({
    where: { id: runId, tenantId: actor.tenantId },
  });
  if (!run) throw new NotFoundError("Payroll run not found");

  const extra: Record<string, unknown> = {
    tenantId: actor.tenantId,
    payrollRunId: runId,
  };
  if (input.employeeId) extra.employeeId = input.employeeId;
  if (input.status) extra.status = input.status;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
    { page: input.page, limit: input.limit, sortBy: "createdAt", sortOrder: "asc" } as never,
    { extraWhere: extra },
  );
  const [rows, total] = await Promise.all([
    db.payslip.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        lines: { orderBy: { displayOrder: "asc" } },
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    }),
    db.payslip.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getPayslip(
  db: TenantPrismaClient,
  actor: PayrollActor,
  payslipId: string,
  ownOnly = false,
) {
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, tenantId: actor.tenantId },
    include: {
      lines: { orderBy: { displayOrder: "asc" } },
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
    },
  });
  if (!payslip) throw new NotFoundError("Payslip not found");

  if (ownOnly && payslip.employeeId !== actor.employeeId) {
    throw new AuthorizationError("You can only view your own payslips");
  }

  return payslip;
}

/**
 * Payslip HTML/print view.
 *
 * Returns a self-contained HTML document. The wire response sets
 * `Content-Type: text/html`; the browser converts to PDF via
 * `window.print()` (the rendered HTML includes a Print button). This
 * mirrors the existing receipt module's `format=html` and avoids
 * pulling in a 280 MB Puppeteer dependency for what's effectively
 * one printable view.
 *
 * Same permission gate as `getPayslip` — the route enforces
 * `hr.payroll.read.payslip.all` or `ess.payslips.download`
 * depending on which path mounts this. The `ownOnly` flag mirrors
 * the JSON path's behaviour.
 */
export async function getPayslipHtml(
  db: TenantPrismaClient,
  actor: PayrollActor,
  payslipId: string,
  ownOnly = false,
): Promise<string> {
  const { renderPayslipHtml } = await import("./payslip.html");

  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, tenantId: actor.tenantId },
    include: {
      lines: { orderBy: { displayOrder: "asc" } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  if (!payslip) throw new NotFoundError("Payslip not found");
  if (ownOnly && payslip.employeeId !== actor.employeeId) {
    throw new AuthorizationError("You can only view your own payslips");
  }

  const tenant = (await db.tenant.findUnique({
    where: { id: actor.tenantId },
    select: {
      name: true,
      logo: true,
      address: true,
      phone: true,
      email: true,
    },
  })) ?? { name: "Unknown Tenant", logo: null, address: null, phone: null, email: null };

  return renderPayslipHtml({
    payslip: {
      id: payslip.id,
      status: payslip.status,
      periodStart: payslip.periodStart,
      periodEnd: payslip.periodEnd,
      currency: (payslip as { currency?: string }).currency ?? "USD",
      gross: payslip.grossPay,
      totalDeductions: payslip.totalDeductions,
      netPay: payslip.netPay,
      lines: payslip.lines as never,
    },
    employee: {
      employeeCode: payslip.employee.employeeCode,
      firstName: payslip.employee.firstName,
      lastName: payslip.employee.lastName,
      designationTitle: payslip.employee.designation?.title ?? null,
      departmentName: payslip.employee.department?.name ?? null,
    },
    tenant,
  });
}

export async function voidPayslip(
  db: TenantPrismaClient,
  actor: PayrollActor,
  payslipId: string,
  input: PayslipVoidInput,
) {
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, tenantId: actor.tenantId },
  });
  if (!payslip) throw new NotFoundError("Payslip not found");
  if (payslip.status !== "FINALIZED") {
    throw new ValidationError("Only FINALIZED payslips can be voided via a reversal run");
  }

  await db.payslip.update({
    where: { id: payslipId },
    data: {
      status: "VOIDED",
      reversesPayslipId: input.reversalRunId ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "PAYSLIP_VOIDED",
    entityType: "Payslip",
    entityId: payslipId,
    oldData: { status: "FINALIZED" },
    newData: { status: "VOIDED", reason: input.reason },
  });

  return db.payslip.findFirstOrThrow({
    where: { id: payslipId },
    include: { lines: { orderBy: { displayOrder: "asc" } } },
  });
}

// ─── ESS: Own payslips ─────────────────────────────────────────────────────────

export async function listOwnPayslips(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: PayslipListInput,
) {
  if (!actor.employeeId) {
    throw new AuthorizationError("No employee profile linked to this account");
  }

  const extra: Record<string, unknown> = {
    tenantId: actor.tenantId,
    employeeId: actor.employeeId,
    status: "FINALIZED",
  };
  if (input.status) extra.status = input.status;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
    { page: input.page, limit: input.limit, sortBy: "createdAt", sortOrder: "desc" } as never,
    { extraWhere: extra },
  );
  const [rows, total] = await Promise.all([
    db.payslip.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { lines: { orderBy: { displayOrder: "asc" } } },
    }),
    db.payslip.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}
