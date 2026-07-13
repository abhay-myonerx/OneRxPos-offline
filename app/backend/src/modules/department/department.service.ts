// HRM Department service. Tenant-scoped via the `db` (TenantPrismaClient)
// parameter. Throws typed AppError subclasses; writes audit logs for
// every mutation.

import type { TenantPrismaClient } from "../../config/database";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import {
  activeOnly,
  softDelete,
  restoreSoftDeleted,
  withArchived,
  type ArchivedFilter,
} from "../../shared/utils/softDelete";

import type {
  CreateDepartmentInput,
  ListDepartmentInput,
  UpdateDepartmentInput,
} from "./department.validation";

interface Actor {
  id: string;
  tenantId: string;
}

const searchableFields = ["name", "code"] as const;

export async function list(db: TenantPrismaClient, params: ListDepartmentInput) {
  const { archived, isActive, ...rest } = params;

  // archived=any wins; isActive=false wins over default-active.
  const baseWhere: Record<string, unknown> =
    archived !== undefined
      ? withArchived({}, archived as ArchivedFilter)
      : isActive !== undefined
        ? { isActive }
        : activeOnly({});

  const { where, orderBy, skip, take, meta } = buildPrismaListQuery(rest as never, {
    searchableFields,
    extraWhere: baseWhere,
  });

  const [data, total] = await Promise.all([
    db.department.findMany({ where, orderBy, skip, take }),
    db.department.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getById(db: TenantPrismaClient, id: string) {
  const row = await db.department.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });
  if (!row) throw new NotFoundError("Department", id);
  return row;
}

export async function create(db: TenantPrismaClient, actor: Actor, input: CreateDepartmentInput) {
  const existing = await db.department.findFirst({
    where: { code: input.code },
  });
  if (existing) {
    throw new ConflictError(`A department with code "${input.code}" already exists`);
  }

  const row = await db.department.create({
    data: {
      tenantId: actor.tenantId,
      name: input.name,
      code: input.code,
      description: input.description ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DEPARTMENT_CREATED",
    entityType: "Department",
    entityId: row.id,
    newData: row,
  });

  return row;
}

export async function update(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: UpdateDepartmentInput,
) {
  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Department", id);

  if (input.code && input.code !== existing.code) {
    const conflict = await db.department.findFirst({
      where: { code: input.code, id: { not: id } },
    });
    if (conflict) {
      throw new ConflictError(`A department with code "${input.code}" already exists`);
    }
  }

  const row = await db.department.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      code: input.code ?? undefined,
      description: input.description === undefined ? undefined : input.description,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DEPARTMENT_UPDATED",
    entityType: "Department",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function deactivate(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.department.findUnique({
    where: { id },
    include: {
      _count: { select: { employees: { where: { isActive: true } } } },
    },
  });
  if (!existing) throw new NotFoundError("Department", id);

  if (existing._count.employees > 0) {
    throw new ConflictError(
      `Cannot deactivate department — ${existing._count.employees} active employee(s) still reference it. Reassign them first.`,
    );
  }

  if (!existing.isActive) return existing;

  const row = (await softDelete(db.department, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DEPARTMENT_DEACTIVATED",
    entityType: "Department",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function restore(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.department.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Department", id);
  if (existing.isActive) return existing;

  const row = (await restoreSoftDeleted(db.department, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DEPARTMENT_REACTIVATED",
    entityType: "Department",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}
