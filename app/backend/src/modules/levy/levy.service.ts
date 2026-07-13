// Levy service (Phase 1.2 Pricing Brain). Tenant-scoped via the `db`
// (TenantPrismaClient) parameter. Throws typed AppError subclasses;
// writes audit logs for every mutation. Structure mirrors
// `src/modules/brand/brand.service.ts` / `src/modules/department/department.service.ts`.

import type { TenantPrismaClient } from "../../config/database";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import { activeOnly, softDelete, withArchived, type ArchivedFilter } from "../../shared/utils/softDelete";

import type { CreateLevyInput, ListLevyInput, UpdateLevyInput } from "./levy.validation";

interface Actor {
  id: string;
  tenantId: string;
}

const searchableFields = ["name", "code"] as const;

export async function list(db: TenantPrismaClient, params: ListLevyInput) {
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
    db.levy.findMany({ where, orderBy, skip, take }),
    db.levy.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getById(db: TenantPrismaClient, id: string) {
  const row = await db.levy.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Levy", id);
  return row;
}

export async function create(db: TenantPrismaClient, actor: Actor, input: CreateLevyInput) {
  const existing = await db.levy.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new ConflictError(`A levy with code "${input.code}" already exists`);
  }

  const row = await db.levy.create({
    data: {
      tenantId: actor.tenantId,
      code: input.code,
      name: input.name,
      mode: input.mode,
      amount: input.amount,
      taxable: input.taxable,
      effectiveFrom: input.effectiveFrom ?? undefined,
      effectiveTo: input.effectiveTo ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEVY_CREATED",
    entityType: "Levy",
    entityId: row.id,
    newData: row,
  });

  return row;
}

export async function update(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: UpdateLevyInput,
) {
  const existing = await db.levy.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Levy", id);

  if (input.code && input.code !== existing.code) {
    const conflict = await db.levy.findFirst({
      where: { code: input.code, id: { not: id } },
    });
    if (conflict) {
      throw new ConflictError(`A levy with code "${input.code}" already exists`);
    }
  }

  const row = await db.levy.update({
    where: { id },
    data: {
      code: input.code ?? undefined,
      name: input.name ?? undefined,
      mode: input.mode ?? undefined,
      amount: input.amount ?? undefined,
      taxable: input.taxable ?? undefined,
      effectiveFrom: input.effectiveFrom ?? undefined,
      effectiveTo: input.effectiveTo ?? undefined,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEVY_UPDATED",
    entityType: "Levy",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function deactivate(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.levy.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Levy", id);

  if (!existing.isActive) return existing;

  const row = (await softDelete(db.levy, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "LEVY_DEACTIVATED",
    entityType: "Levy",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}
