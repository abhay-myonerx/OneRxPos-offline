// Catalog Brand service. Tenant-scoped via the `db`
// (TenantPrismaClient) parameter. Throws typed AppError subclasses;
// writes audit logs for every mutation.

import type { TenantPrismaClient } from "../../config/database";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { buildPrismaListQuery, formatListResponse } from "../../shared/utils/listQuery";
import { recordAudit } from "../../shared/utils/auditLog";
import {
  activeOnly,
  restoreSoftDeleted,
  softDelete,
  withArchived,
  type ArchivedFilter,
} from "../../shared/utils/softDelete";

import {
  slugify,
  type CreateBrandInput,
  type ListBrandInput,
  type UpdateBrandInput,
} from "./brand.validation";

interface Actor {
  id: string;
  tenantId: string;
}

const searchableFields = ["name", "slug"] as const;

export async function list(db: TenantPrismaClient, params: ListBrandInput) {
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
    db.brand.findMany({ where, orderBy, skip, take }),
    db.brand.count({ where }),
  ]);
  return formatListResponse(data, total, meta);
}

export async function getById(db: TenantPrismaClient, id: string) {
  const row = await db.brand.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!row) throw new NotFoundError("Brand", id);
  return row;
}

async function resolveUniqueSlug(
  db: TenantPrismaClient,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(desired) || "brand";
  let candidate = base;
  let suffix = 2;
  // Linear probe — Brand counts per tenant are small in practice.
  // Bounded at 100 attempts to avoid pathological loops.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const conflict = await db.brand.findFirst({
      where: {
        slug: candidate,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (!conflict) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  throw new ConflictError(`Unable to derive a unique slug from "${desired}" after 100 attempts`);
}

export async function create(db: TenantPrismaClient, actor: Actor, input: CreateBrandInput) {
  const slug = input.slug
    ? await assertSlugAvailable(db, input.slug)
    : await resolveUniqueSlug(db, input.name);

  const row = await db.brand.create({
    data: {
      tenantId: actor.tenantId,
      name: input.name,
      slug,
      description: input.description ?? null,
      logo: input.logo ?? null,
      website: input.website ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "BRAND_CREATED",
    entityType: "Brand",
    entityId: row.id,
    newData: row,
  });

  return row;
}

async function assertSlugAvailable(
  db: TenantPrismaClient,
  slug: string,
  ignoreId?: string,
): Promise<string> {
  const normalized = slugify(slug);
  if (!normalized) {
    throw new ConflictError("Slug is empty after normalization");
  }
  const conflict = await db.brand.findFirst({
    where: {
      slug: normalized,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    throw new ConflictError(`A brand with slug "${normalized}" already exists`);
  }
  return normalized;
}

export async function update(
  db: TenantPrismaClient,
  actor: Actor,
  id: string,
  input: UpdateBrandInput,
) {
  const existing = await db.brand.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Brand", id);

  const nextSlug =
    input.slug && input.slug !== existing.slug
      ? await assertSlugAvailable(db, input.slug, id)
      : undefined;

  const row = await db.brand.update({
    where: { id },
    data: {
      name: input.name ?? undefined,
      slug: nextSlug,
      description: input.description === undefined ? undefined : input.description,
      logo: input.logo === undefined ? undefined : input.logo,
      website: input.website === undefined ? undefined : input.website,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "BRAND_UPDATED",
    entityType: "Brand",
    entityId: row.id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function deactivate(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.brand.findUnique({
    where: { id },
    include: {
      _count: { select: { products: { where: { isActive: true } } } },
    },
  });
  if (!existing) throw new NotFoundError("Brand", id);

  if (existing._count.products > 0) {
    throw new ConflictError(
      `Cannot deactivate brand — ${existing._count.products} active product(s) still reference it. Reassign them first.`,
    );
  }

  if (!existing.isActive) return existing;

  const row = (await softDelete(db.brand, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "BRAND_DEACTIVATED",
    entityType: "Brand",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}

export async function restore(db: TenantPrismaClient, actor: Actor, id: string) {
  const existing = await db.brand.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Brand", id);
  if (existing.isActive) return existing;

  const row = (await restoreSoftDeleted(db.brand, id)) as typeof existing;

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "BRAND_REACTIVATED",
    entityType: "Brand",
    entityId: id,
    oldData: existing,
    newData: row,
  });

  return row;
}
