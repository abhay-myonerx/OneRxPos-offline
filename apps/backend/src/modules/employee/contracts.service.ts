// EmploymentContract CRUD.
//
// Contracts are append-only. Updates happen by superseding: create
// a new contract with `supersedesId` pointing at the current chain
// head; the service stamps the previous contract's `effectiveTo`
// to `effectiveFrom - 1 day` so the chain has no overlap.

import { prisma } from "../../config/database";
import type { TenantPrismaClient } from "../../config/database";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import type { AuthUserLike } from "../../shared/permissions/resolver";

import type { CreateContractInput } from "./contracts.validation";

const contractSelect = {
  id: true,
  employeeId: true,
  contractNumber: true,
  title: true,
  employmentType: true,
  departmentId: true,
  designationId: true,
  storeId: true,
  reportsToId: true,
  salaryStructureId: true,
  effectiveFrom: true,
  effectiveTo: true,
  documentUrl: true,
  notes: true,
  supersedesId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function list(
  db: TenantPrismaClient,
  employeeId: string,
  params: Record<string, unknown>,
) {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!emp) throw new NotFoundError("Employee", employeeId);

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(params as never, {
    extraWhere: { employeeId },
    searchableFields: ["title", "contractNumber"],
  });

  const [data, total] = await Promise.all([
    db.employmentContract.findMany({
      where,
      orderBy,
      skip,
      take,
      select: contractSelect,
    }),
    db.employmentContract.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function create(
  db: TenantPrismaClient,
  actor: AuthUserLike,
  employeeId: string,
  input: CreateContractInput,
) {
  const emp = await db.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!emp) throw new NotFoundError("Employee", employeeId);

  // Validate supersedes target belongs to the same employee.
  if (input.supersedesId) {
    const prev = await db.employmentContract.findUnique({
      where: { id: input.supersedesId },
      select: { id: true, employeeId: true, effectiveTo: true },
    });
    if (!prev || prev.employeeId !== employeeId) {
      throw new ValidationError("supersedesId does not point at a contract for this employee");
    }
    // The chain head must not have already been superseded.
    const alreadyChained = await db.employmentContract.findFirst({
      where: { supersedesId: input.supersedesId },
      select: { id: true },
    });
    if (alreadyChained) {
      throw new ConflictError("That contract has already been superseded; cannot supersede again");
    }
  }

  const row = await prisma.$transaction(async (tx) => {
    // If superseding, set the previous contract's effectiveTo
    // to one day before the new contract's start.
    if (input.supersedesId) {
      const dayBefore = new Date(input.effectiveFrom);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      await tx.employmentContract.update({
        where: { id: input.supersedesId },
        data: { effectiveTo: dayBefore },
      });
    }

    return tx.employmentContract.create({
      data: {
        tenantId: actor.tenantId,
        employeeId,
        contractNumber: input.contractNumber ?? null,
        title: input.title,
        employmentType: input.employmentType,
        departmentId: input.departmentId ?? null,
        designationId: input.designationId ?? null,
        storeId: input.storeId ?? null,
        reportsToId: input.reportsToId ?? null,
        salaryStructureId: input.salaryStructureId ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        documentUrl: input.documentUrl ?? null,
        notes: input.notes ?? null,
        supersedesId: input.supersedesId ?? null,
      },
      select: contractSelect,
    });
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "EMPLOYMENT_CONTRACT_CREATED",
    entityType: "EmploymentContract",
    entityId: row.id,
    newData: { ...row, fieldsRedacted: ["notes"] },
  });

  return row;
}
