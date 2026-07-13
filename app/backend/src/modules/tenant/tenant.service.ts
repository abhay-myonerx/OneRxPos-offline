// Tenant business logic — profile, settings, plan management, dashboard stats

import { prisma } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { logger } from "../../shared/utils/logger";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";
import type {
  UpdateTenantInput,
  UpdateSettingsInput,
  ChangePlanInput,
  ChangeStatusInput,
} from "./tenant.validation";

export async function getMyTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      _count: {
        select: {
          stores: true,
          users: true,
          products: true,
          customers: true,
        },
      },
    },
  });

  if (!tenant) throw new NotFoundError("Tenant", tenantId);
  return tenant;
}

export async function updateTenant(tenantId: string, input: UpdateTenantInput) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Tenant", tenantId);

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: input,
  });

  logger.info({ tenantId }, "Tenant profile updated");
  return updated;
}

export async function updateSettings(tenantId: string, input: UpdateSettingsInput) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Tenant", tenantId);

  const currentSettings = (tenant.settings as Record<string, unknown>) ?? {};
  const mergedSettings = { ...currentSettings, ...input };

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: mergedSettings as any },
  });

  logger.info({ tenantId, keys: Object.keys(input) }, "Tenant settings updated");
  return updated;
}

export async function getSettings(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, settings: true },
  });

  if (!tenant) throw new NotFoundError("Tenant", tenantId);
  return tenant.settings;
}

// Enhanced dashboard stats with period-over-period comparison data.
export async function getDashboardStats(tenantId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);

  const [
    storeCount,
    userCount,
    productCount,
    customerCount,
    todaySales,
    todayRevAgg,
    yesterdayRevAgg,
    thisMonthRevAgg,
    lastMonthRevAgg,
    newCustThisMonth,
    newCustLastMonth,
    totalExpensesThisMonth,
  ] = await Promise.all([
    prisma.store.count({ where: { tenantId, isActive: true } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.product.count({ where: { tenantId, isActive: true } }),
    prisma.customer.count({ where: { tenantId, isActive: true } }),
    prisma.sale.count({
      where: { tenantId, status: "COMPLETED", createdAt: { gte: todayStart } },
    }),
    prisma.sale.aggregate({
      where: { tenantId, status: { in: ["COMPLETED", "PARTIAL"] }, createdAt: { gte: todayStart } },
      _sum: { grandTotal: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
      _sum: { grandTotal: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: thisMonthStart },
      },
      _sum: { grandTotal: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
      _sum: { grandTotal: true },
    }),
    prisma.customer.count({ where: { tenantId, createdAt: { gte: thisMonthStart } } }),
    prisma.customer.count({
      where: { tenantId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd } },
    }),
    prisma.expense.aggregate({
      where: { tenantId, date: { gte: thisMonthStart } },
      _sum: { amount: true },
    }),
  ]);

  return {
    stores: storeCount,
    users: userCount,
    products: productCount,
    customers: customerCount,
    todaySales,
    todayRevenue: todayRevAgg._sum.grandTotal?.toString() ?? "0",
    yesterdayRevenue: yesterdayRevAgg._sum.grandTotal?.toString() ?? "0",
    thisMonthRevenue: thisMonthRevAgg._sum.grandTotal?.toString() ?? "0",
    lastMonthRevenue: lastMonthRevAgg._sum.grandTotal?.toString() ?? "0",
    newCustomersThisMonth: newCustThisMonth,
    newCustomersLastMonth: newCustLastMonth,
    totalExpensesThisMonth: totalExpensesThisMonth._sum.amount?.toString() ?? "0",
  };
}

// Manager dashboard stats — accessible to MANAGER role (uses report:read permission).
export async function getManagerDashboardStats(tenantId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);

  const [
    todaySales,
    todayRevAgg,
    yesterdayRevAgg,
    thisMonthRevAgg,
    lastMonthRevAgg,
    newCustThisMonth,
    totalExpenses,
    storeCount,
    userCount,
    topProducts,
    storePerformance,
  ] = await Promise.all([
    prisma.sale.count({
      where: { tenantId, status: "COMPLETED", createdAt: { gte: todayStart } },
    }),
    prisma.sale.aggregate({
      where: { tenantId, status: { in: ["COMPLETED", "PARTIAL"] }, createdAt: { gte: todayStart } },
      _sum: { grandTotal: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: yesterdayStart, lt: todayStart },
      },
      _sum: { grandTotal: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: thisMonthStart },
      },
      _sum: { grandTotal: true },
    }),
    prisma.sale.aggregate({
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
      },
      _sum: { grandTotal: true },
    }),
    prisma.customer.count({ where: { tenantId, createdAt: { gte: thisMonthStart } } }),
    prisma.expense.aggregate({
      where: { tenantId, date: { gte: thisMonthStart } },
      _sum: { amount: true },
    }),
    prisma.store.count({ where: { tenantId, isActive: true } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        sale: {
          tenantId,
          status: { in: ["COMPLETED", "PARTIAL"] },
          createdAt: { gte: thisMonthStart },
        },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: "desc" } },
      take: 6,
    }),
    prisma.sale.groupBy({
      by: ["storeId"],
      where: {
        tenantId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: thisMonthStart },
      },
      _sum: { grandTotal: true },
      _count: true,
    }),
  ]);

  const productIds = topProducts.map((p) => p.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const storeIds = storePerformance.map((s) => s.storeId);
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  return {
    todaySales,
    todayRevenue: todayRevAgg._sum.grandTotal?.toString() ?? "0",
    yesterdayRevenue: yesterdayRevAgg._sum.grandTotal?.toString() ?? "0",
    thisMonthRevenue: thisMonthRevAgg._sum.grandTotal?.toString() ?? "0",
    lastMonthRevenue: lastMonthRevAgg._sum.grandTotal?.toString() ?? "0",
    newCustomersThisMonth: newCustThisMonth,
    totalExpensesThisMonth: totalExpenses._sum.amount?.toString() ?? "0",
    stores: storeCount,
    users: userCount,
    topProducts: topProducts.map((p) => ({
      productId: p.productId,
      name: productMap.get(p.productId)?.name ?? "Unknown",
      qtySold: p._sum.quantity ?? 0,
      revenue: p._sum.lineTotal?.toString() ?? "0",
    })),
    storePerformance: storePerformance.map((s) => ({
      storeId: s.storeId,
      storeName: storeMap.get(s.storeId)?.name ?? "Unknown",
      saleCount: s._count,
      revenue: s._sum.grandTotal?.toString() ?? "0",
    })),
  };
}

export async function listTenants(
  filters: { status?: string; plan?: string; search?: string },
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  if (filters.status) where.status = filters.status;
  if (filters.plan) where.plan = filters.plan;
  if (filters.search) {
    where.OR = [
      { name: ciContains(filters.search) },
      { email: ciContains(filters.search) },
      { slug: ciContains(filters.search) },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      include: { _count: { select: { stores: true, users: true } } },
      ...buildPagination(pagination),
    }),
    prisma.tenant.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

export async function getTenantById(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      stores: { select: { id: true, name: true, code: true, isActive: true } },
      _count: { select: { users: true, products: true, customers: true, sales: true } },
    },
  });

  if (!tenant) throw new NotFoundError("Tenant", tenantId);
  return tenant;
}

export async function changePlan(tenantId: string, input: ChangePlanInput) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Tenant", tenantId);

  if (tenant.plan === input.plan) {
    throw new ConflictError(`Tenant is already on the ${input.plan} plan`);
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { plan: input.plan },
  });

  logger.info({ tenantId, from: tenant.plan, to: input.plan }, "Tenant plan changed");
  return updated;
}

export async function changeStatus(tenantId: string, input: ChangeStatusInput) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new NotFoundError("Tenant", tenantId);

  if (tenant.status === input.status) {
    throw new ConflictError(`Tenant is already ${input.status}`);
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: input.status },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: "tenant.status_changed",
      entityType: "tenant",
      entityId: tenantId,
      oldData: { status: tenant.status },
      newData: { status: input.status, reason: input.reason },
    },
  });

  logger.info(
    { tenantId, from: tenant.status, to: input.status, reason: input.reason },
    "Tenant status changed",
  );

  return updated;
}
