import { TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { logger } from "../../shared/utils/logger";
import type {
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSuppliersInput,
} from "./supplier.validation";

export async function listSuppliers(db: TenantPrismaClient, filters: ListSuppliersInput) {
  const where: Record<string, unknown> = {};

  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search) {
    where.OR = [
      { name: ciContains(filters.search) },
      { email: ciContains(filters.search) },
      { contactName: ciContains(filters.search) },
    ];
  }

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    db.supplier.findMany({
      where,
      include: { _count: { select: { purchases: true } } },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip,
      take: filters.limit,
    }),
    db.supplier.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasMore: filters.page * filters.limit < total,
    },
  };
}

export async function getSupplierById(db: TenantPrismaClient, supplierId: string) {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    include: { _count: { select: { purchases: true } } },
  });
  if (!supplier) throw new NotFoundError("Supplier", supplierId);
  return supplier;
}

export async function createSupplier(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateSupplierInput,
) {
  if (input.email) {
    const existing = await db.supplier.findFirst({ where: { email: input.email } });
    if (existing) throw new ConflictError("A supplier with this email already exists");
  }

  const supplier = await db.supplier.create({
    data: {
      tenantId,
      name: input.name,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      taxId: input.taxId ?? null,
    },
  });

  logger.info({ tenantId, supplierId: supplier.id }, "Supplier created");
  return supplier;
}

export async function updateSupplier(
  db: TenantPrismaClient,
  supplierId: string,
  input: UpdateSupplierInput,
) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new NotFoundError("Supplier", supplierId);

  if (input.email && input.email !== supplier.email) {
    const conflict = await db.supplier.findFirst({
      where: { email: input.email, id: { not: supplierId } },
    });
    if (conflict) throw new ConflictError("A supplier with this email already exists");
  }

  const updated = await db.supplier.update({ where: { id: supplierId }, data: input });
  logger.info({ supplierId }, "Supplier updated");
  return updated;
}

export async function deleteSupplier(db: TenantPrismaClient, supplierId: string) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw new NotFoundError("Supplier", supplierId);

  if (Number(supplier.balance) > 0) {
    throw new ConflictError(
      `Cannot deactivate supplier — outstanding balance of ${supplier.balance}`,
    );
  }

  const updated = await db.supplier.update({
    where: { id: supplierId },
    data: { isActive: false },
  });
  logger.info({ supplierId }, "Supplier deactivated");
  return updated;
}
