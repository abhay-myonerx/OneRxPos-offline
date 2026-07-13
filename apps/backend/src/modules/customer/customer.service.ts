import { TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { logger } from "../../shared/utils/logger";
import { ciEquals, ciContains } from "../../shared/utils/ci-match";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersInput,
  CreateGroupInput,
  UpdateGroupInput,
} from "./customer.validation";

// ── List customers ──────────────────────────────────────────────────────────────

export async function listCustomers(db: TenantPrismaClient, filters: ListCustomersInput) {
  const where: Record<string, unknown> = {};

  if (filters.groupId) where.groupId = filters.groupId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.hasDue) where.currentBalance = { gt: 0 };

  if (filters.search) {
    where.OR = [
      { name: ciContains(filters.search) },
      { email: ciContains(filters.search) },
      { phone: ciContains(filters.search) },
    ];
  }

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: {
        group: { select: { id: true, name: true, discountPercent: true } },
        _count: { select: { sales: true } },
      },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip,
      take: filters.limit,
    }),
    db.customer.count({ where }),
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

// ── Get customer by ID ──────────────────────────────────────────────────────────

export async function getCustomerById(db: TenantPrismaClient, customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      group: true,
      _count: { select: { sales: true, loyaltyTransactions: true } },
    },
  });

  if (!customer) throw new NotFoundError("Customer", customerId);
  return customer;
}

// ── Create customer ─────────────────────────────────────────────────────────────

export async function createCustomer(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateCustomerInput,
) {
  // Check email uniqueness within tenant
  if (input.email) {
    const existing = await db.customer.findFirst({ where: { email: input.email } });
    if (existing) throw new ConflictError("A customer with this email already exists");
  }

  // Check phone uniqueness within tenant
  if (input.phone) {
    const existing = await db.customer.findFirst({ where: { phone: input.phone } });
    if (existing) throw new ConflictError("A customer with this phone already exists");
  }

  // Validate group
  if (input.groupId) {
    const group = await db.customerGroup.findUnique({ where: { id: input.groupId } });
    if (!group) throw new NotFoundError("Customer group", input.groupId);
  }

  const customer = await db.customer.create({
    data: {
      tenantId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      taxId: input.taxId ?? null,
      groupId: input.groupId ?? null,
      creditLimit: input.creditLimit,
    },
  });

  logger.info({ tenantId, customerId: customer.id }, "Customer created");
  return customer;
}

// ── Update customer ─────────────────────────────────────────────────────────────

export async function updateCustomer(
  db: TenantPrismaClient,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer", customerId);

  // Check email uniqueness if changing
  if (input.email && input.email !== customer.email) {
    const conflict = await db.customer.findFirst({
      where: { email: input.email, id: { not: customerId } },
    });
    if (conflict) throw new ConflictError("A customer with this email already exists");
  }

  // Check phone uniqueness if changing
  if (input.phone && input.phone !== customer.phone) {
    const conflict = await db.customer.findFirst({
      where: { phone: input.phone, id: { not: customerId } },
    });
    if (conflict) throw new ConflictError("A customer with this phone already exists");
  }

  const updated = await db.customer.update({
    where: { id: customerId },
    data: input,
  });

  logger.info({ customerId }, "Customer updated");
  return updated;
}

// ── Delete customer (soft) ──────────────────────────────────────────────────────

export async function deleteCustomer(db: TenantPrismaClient, customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { _count: { select: { sales: true } } },
  });

  if (!customer) throw new NotFoundError("Customer", customerId);

  if (Number(customer.currentBalance) > 0) {
    throw new ConflictError(
      `Cannot deactivate customer — outstanding balance of ${customer.currentBalance}`,
    );
  }

  const updated = await db.customer.update({
    where: { id: customerId },
    data: { isActive: false },
  });

  logger.info({ customerId }, "Customer deactivated");
  return updated;
}

// ── Customer ledger (sales + payments for a customer) ───────────────────────────

export async function getCustomerLedger(
  db: TenantPrismaClient,
  customerId: string,
  page: number = 1,
  limit: number = 20,
) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer", customerId);

  const skip = (page - 1) * limit;

  const [sales, payments] = await Promise.all([
    db.sale.findMany({
      where: { customerId },
      select: {
        id: true,
        invoiceNo: true,
        grandTotal: true,
        paidAmount: true,
        dueAmount: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.payment.findMany({
      where: { customerId },
      select: {
        id: true,
        method: true,
        amount: true,
        status: true,
        createdAt: true,
        saleId: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      currentBalance: customer.currentBalance,
      creditLimit: customer.creditLimit,
      loyaltyPoints: customer.loyaltyPoints,
    },
    sales,
    payments,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER GROUPS
// ═══════════════════════════════════════════════════════════════════════════════

export async function listGroups(db: TenantPrismaClient) {
  return db.customerGroup.findMany({
    include: { _count: { select: { customers: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createGroup(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateGroupInput,
) {
  const existing = await db.customerGroup.findFirst({
    where: { name: ciEquals(input.name) },
  });
  if (existing) throw new ConflictError(`Group "${input.name}" already exists`);

  return db.customerGroup.create({
    data: {
      tenantId,
      name: input.name,
      discountPercent: input.discountPercent,
      pricingTier: input.pricingTier ?? null,
    },
  });
}

export async function updateGroup(
  db: TenantPrismaClient,
  groupId: string,
  input: UpdateGroupInput,
) {
  const group = await db.customerGroup.findUnique({ where: { id: groupId } });
  if (!group) throw new NotFoundError("Customer group", groupId);

  return db.customerGroup.update({
    where: { id: groupId },
    data: input,
  });
}

export async function deleteGroup(db: TenantPrismaClient, groupId: string) {
  const group = await db.customerGroup.findUnique({
    where: { id: groupId },
    include: { _count: { select: { customers: true } } },
  });

  if (!group) throw new NotFoundError("Customer group", groupId);

  if (group._count.customers > 0) {
    throw new ConflictError(`Cannot delete group — ${group._count.customers} customer(s) assigned`);
  }

  await db.customerGroup.delete({ where: { id: groupId } });
  return { success: true };
}
