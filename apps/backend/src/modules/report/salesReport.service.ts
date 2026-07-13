import { TenantPrismaClient } from "../../config/database";
import type { ReportQuery } from "./report.validation";

export async function getSalesReport(db: TenantPrismaClient, query: ReportQuery) {
  const where: Record<string, unknown> = {
    status: { in: ["COMPLETED", "PARTIAL"] },
    createdAt: { gte: query.dateFrom, lte: query.dateTo },
  };
  if (query.storeId) where.storeId = query.storeId;

  const summary = await db.sale.aggregate({
    where,
    _sum: {
      grandTotal: true,
      taxTotal: true,
      discountAmount: true,
      paidAmount: true,
      dueAmount: true,
    },
    _count: true,
    _avg: { grandTotal: true },
  });

  const paymentWhere: Record<string, unknown> = {
    status: "COMPLETED",
    createdAt: { gte: query.dateFrom, lte: query.dateTo },
  };
  if (query.storeId) {
    paymentWhere.sale = { storeId: query.storeId };
  }

  const byPaymentMethod = await db.payment.groupBy({
    by: ["method"],
    where: paymentWhere,
    _sum: { amount: true },
    _count: true,
  });

  const topProducts = await db.saleItem.groupBy({
    by: ["productId"],
    where: { sale: { ...where } },
    _sum: { quantity: true, lineTotal: true },
    _count: true,
    orderBy: { _sum: { lineTotal: "desc" } },
    take: 10,
  });

  const productIds = topProducts.map((p) => p.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const byStatus = await db.sale.groupBy({
    by: ["status"],
    where: {
      createdAt: { gte: query.dateFrom, lte: query.dateTo },
      ...(query.storeId && { storeId: query.storeId }),
    },
    _count: true,
    _sum: { grandTotal: true },
  });

  return {
    period: { from: query.dateFrom, to: query.dateTo },
    summary: {
      totalSales: summary._count,
      totalRevenue: summary._sum.grandTotal?.toString() ?? "0",
      totalTax: summary._sum.taxTotal?.toString() ?? "0",
      totalDiscount: summary._sum.discountAmount?.toString() ?? "0",
      totalPaid: summary._sum.paidAmount?.toString() ?? "0",
      totalDue: summary._sum.dueAmount?.toString() ?? "0",
      avgSaleValue: summary._avg.grandTotal?.toString() ?? "0",
    },
    byPaymentMethod: byPaymentMethod.map((p) => ({
      method: p.method,
      total: p._sum.amount?.toString() ?? "0",
      count: p._count,
    })),
    topProducts: topProducts.map((p) => ({
      productId: p.productId,
      name: productMap.get(p.productId)?.name ?? "Unknown",
      sku: productMap.get(p.productId)?.sku ?? "",
      qtySold: p._sum.quantity ?? 0,
      revenue: p._sum.lineTotal?.toString() ?? "0",
    })),
    byStatus: byStatus.map((s) => ({
      status: s.status,
      count: s._count,
      total: s._sum.grandTotal?.toString() ?? "0",
    })),
  };
}

// Returns per-day revenue totals for the last `days` days.
// Every calendar day in the window is present in the result (even zero-sales days).
export async function getDailyRevenueSeries(
  db: TenantPrismaClient,
  days: number = 30,
  storeId?: string,
) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const where: Record<string, unknown> = {
    status: { in: ["COMPLETED", "PARTIAL"] },
    createdAt: { gte: from, lte: to },
  };
  if (storeId) where.storeId = storeId;

  const sales = await db.sale.findMany({
    where,
    select: { grandTotal: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Pre-fill every day in the window with zeros
  const map = new Map<string, { revenue: number; sales: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    map.set(d.toISOString().slice(0, 10), { revenue: 0, sales: 0 });
  }

  for (const sale of sales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    const prev = map.get(key) ?? { revenue: 0, sales: 0 };
    map.set(key, {
      revenue: prev.revenue + parseFloat(sale.grandTotal.toString()),
      sales: prev.sales + 1,
    });
  }

  return Array.from(map.entries()).map(([date, d]) => ({
    date,
    revenue: Math.round(d.revenue * 100) / 100,
    sales: d.sales,
  }));
}

// Cashier-scoped daily stats — only their own sales.
export async function getCashierDailyStats(
  db: TenantPrismaClient,
  cashierId: string,
  days: number = 14,
) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySummary, periodSales] = await Promise.all([
    db.sale.aggregate({
      where: {
        cashierId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: todayStart },
      },
      _sum: { grandTotal: true },
      _count: true,
    }),
    db.sale.findMany({
      where: {
        cashierId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: from, lte: to },
      },
      select: { grandTotal: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const map = new Map<string, { revenue: number; sales: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    map.set(d.toISOString().slice(0, 10), { revenue: 0, sales: 0 });
  }
  for (const s of periodSales) {
    const key = s.createdAt.toISOString().slice(0, 10);
    const prev = map.get(key) ?? { revenue: 0, sales: 0 };
    map.set(key, {
      revenue: prev.revenue + parseFloat(s.grandTotal.toString()),
      sales: prev.sales + 1,
    });
  }

  return {
    todaySales: todaySummary._count,
    todayRevenue: todaySummary._sum.grandTotal?.toString() ?? "0",
    series: Array.from(map.entries()).map(([date, d]) => ({
      date,
      revenue: Math.round(d.revenue * 100) / 100,
      sales: d.sales,
    })),
  };
}
