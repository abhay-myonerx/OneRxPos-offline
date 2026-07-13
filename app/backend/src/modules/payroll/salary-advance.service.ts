// Salary Advance / Loan management.
// State machine: PENDING → APPROVED → DISBURSED → RECOVERING → SETTLED
//                         → REJECTED (pre-disburse)
//                         → CANCELLED (pre-disburse)

import { Prisma } from "../../generated/prisma/client";
import type { TenantPrismaClient } from "../../config/database";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { m } from "../../shared/utils/money";
import { recordAudit } from "../../shared/utils/auditLog";

import type { SalaryAdvanceCreateInput, SalaryAdvanceListInput } from "./payroll.validation";
import type { PayrollActor } from "./payroll.types";

const PRE_DISBURSE_STATUSES = new Set(["PENDING", "APPROVED"]);

export async function listSalaryAdvances(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: SalaryAdvanceListInput,
) {
  const extra: Record<string, unknown> = { tenantId: actor.tenantId };
  if (input.employeeId) extra.employeeId = input.employeeId;
  if (input.status) extra.status = input.status;

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(
    { page: input.page, limit: input.limit, sortBy: "createdAt", sortOrder: "desc" } as never,
    { extraWhere: extra },
  );
  const [rows, total] = await Promise.all([
    db.salaryAdvance.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    }),
    db.salaryAdvance.count({ where }),
  ]);
  return formatListResponse(rows, total, meta);
}

export async function getSalaryAdvance(
  db: TenantPrismaClient,
  actor: PayrollActor,
  advanceId: string,
) {
  const advance = await db.salaryAdvance.findFirst({
    where: { id: advanceId, tenantId: actor.tenantId },
  });
  if (!advance) throw new NotFoundError("Salary advance not found");
  return advance;
}

export async function createSalaryAdvance(
  db: TenantPrismaClient,
  actor: PayrollActor,
  input: SalaryAdvanceCreateInput,
) {
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId, tenantId: actor.tenantId, isActive: true },
  });
  if (!employee) throw new NotFoundError("Employee not found or inactive");

  const amount = m(input.amount);
  const amountPerInstallment = amount.div(input.installments).toDecimalPlaces(4);

  const advance = await db.salaryAdvance.create({
    data: {
      tenantId: actor.tenantId,
      employeeId: input.employeeId,
      amount: new Prisma.Decimal(amount.toFixed(4)),
      currency: input.currency,
      reason: input.reason ?? null,
      installments: input.installments,
      amountPerInstallment: new Prisma.Decimal(amountPerInstallment.toFixed(4)),
      status: "PENDING",
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_ADVANCE_CREATED",
    entityType: "SalaryAdvance",
    entityId: advance.id,
    newData: { employeeId: input.employeeId, amount: input.amount },
  });

  return advance;
}

export async function approveSalaryAdvance(
  db: TenantPrismaClient,
  actor: PayrollActor,
  advanceId: string,
) {
  const advance = await db.salaryAdvance.findFirst({
    where: { id: advanceId, tenantId: actor.tenantId },
  });
  if (!advance) throw new NotFoundError("Salary advance not found");
  if (advance.status !== "PENDING") {
    throw new ValidationError(`Cannot approve an advance in ${advance.status} status`);
  }

  const updated = await db.salaryAdvance.update({
    where: { id: advanceId },
    data: { status: "APPROVED", approvedById: actor.id },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_ADVANCE_APPROVED",
    entityType: "SalaryAdvance",
    entityId: advanceId,
    oldData: { status: "PENDING" },
    newData: { status: "APPROVED" },
  });

  return updated;
}

export async function rejectSalaryAdvance(
  db: TenantPrismaClient,
  actor: PayrollActor,
  advanceId: string,
) {
  const advance = await db.salaryAdvance.findFirst({
    where: { id: advanceId, tenantId: actor.tenantId },
  });
  if (!advance) throw new NotFoundError("Salary advance not found");
  if (!PRE_DISBURSE_STATUSES.has(advance.status)) {
    throw new ValidationError(`Cannot reject an advance in ${advance.status} status`);
  }

  const updated = await db.salaryAdvance.update({
    where: { id: advanceId },
    data: { status: "REJECTED" },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_ADVANCE_REJECTED",
    entityType: "SalaryAdvance",
    entityId: advanceId,
    newData: { status: "REJECTED" },
  });

  return updated;
}

export async function disburseSalaryAdvance(
  db: TenantPrismaClient,
  actor: PayrollActor,
  advanceId: string,
) {
  const advance = await db.salaryAdvance.findFirst({
    where: { id: advanceId, tenantId: actor.tenantId },
  });
  if (!advance) throw new NotFoundError("Salary advance not found");
  if (advance.status !== "APPROVED") {
    throw new ValidationError(`Cannot disburse an advance in ${advance.status} status`);
  }

  const updated = await db.salaryAdvance.update({
    where: { id: advanceId },
    data: { status: "DISBURSED", disbursedAt: new Date() },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_ADVANCE_DISBURSED",
    entityType: "SalaryAdvance",
    entityId: advanceId,
    newData: { status: "DISBURSED", disbursedAt: updated.disbursedAt },
  });

  return updated;
}

export async function cancelSalaryAdvance(
  db: TenantPrismaClient,
  actor: PayrollActor,
  advanceId: string,
) {
  const advance = await db.salaryAdvance.findFirst({
    where: { id: advanceId, tenantId: actor.tenantId },
  });
  if (!advance) throw new NotFoundError("Salary advance not found");
  if (!PRE_DISBURSE_STATUSES.has(advance.status)) {
    throw new ValidationError(
      `Cannot cancel an advance in ${advance.status} status. Only PENDING or APPROVED advances can be cancelled.`,
    );
  }

  const updated = await db.salaryAdvance.update({
    where: { id: advanceId },
    data: { status: "CANCELLED" },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "SALARY_ADVANCE_CANCELLED",
    entityType: "SalaryAdvance",
    entityId: advanceId,
    newData: { status: "CANCELLED" },
  });

  return updated;
}
