// HRM Designation service.
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
  CreateDesignationInput,
  ListDesignationInput,
  UpdateDesignationInput,
} from "./designation.validation";

interface Actor {
  id: string;
  tenantId: string;
}

const searchableFields = ["title", "code"] as const;

export async function list(db: TenantPrismaClient, params: ListDesignationInput) {
  const { archived, isActive, ...rest } = params;

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
    db.designation.findMany({ where, orderBy, skip, take }),
    db.designation.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getById(db: TenantPrismaClient, id: string) {
  const row = await db.designation.findUnique({
    where: { id },
    include: { _count: { select: { employees: true } } },
  });
  if (!row) throw new NotFoundError("Designation", id);
  return row;
}

export async function create(db: TenantPrismaClient, actor: Actor, input: CreateDesignationInput) {
  const existing = await db.designation.findFirst({
    where: { code: input.code },
  });
  if (existing) {
    throw new ConflictError(`A designation with code "${input.code}" already exists`);
  }

  const row = await db.designation.create({
    data: {
      tenantId: actor.tenantId,
      title: input.title,
      code: input.code,
      level: input.level ?? null,
      description: input.description ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DESIGNATION_CREATED",
    entityType: "Designation",
    entityId: row.id,
    newData: row,
  });

  return row;
}

export async function update(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: UpdateDesignationInput,
) {
  const existing = await db.designation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Designation", id);

  if (input.code && input.code !== existing.code) {
    const conflict = await db.designation.findFirst({
      where: { code: input.code, id: { not: id } },
    });
    if (conflict) {
      throw new ConflictError(`A designation with code "${input.code}" already exists`);
    }
  }

  const row = await db.designation.update({
    where: { id },
    data: {
      title: input.title ?? undefined,
      code: input.code ?? undefined,
      level: input.level === undefined ? undefined : input.level,
      description: input.description === undefined ? undefined : input.description,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DESIGNATION_UPDATED",
    entityType: "Designation",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function deactivate(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.designation.findUnique({
    where: { id },
    include: {
      _count: { select: { employees: { where: { isActive: true } } } },
    },
  });
  if (!existing) throw new NotFoundError("Designation", id);

  if (existing._count.employees > 0) {
    throw new ConflictError(
      `Cannot deactivate designation — ${existing._count.employees} active employee(s) still reference it. Reassign them first.`,
    );
  }

  if (!existing.isActive) return existing;

  const row = (await softDelete(db.designation, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DESIGNATION_DEACTIVATED",
    entityType: "Designation",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function restore(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.designation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Designation", id);
  if (existing.isActive) return existing;

  const row = (await restoreSoftDeleted(db.designation, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "DESIGNATION_REACTIVATED",
    entityType: "Designation",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}
