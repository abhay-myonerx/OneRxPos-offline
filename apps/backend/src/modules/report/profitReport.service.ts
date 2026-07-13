import { TenantPrismaClient } from "../../config/database";
import type { ReportQuery } from "./report.validation";

export async function getProfitReport(db: TenantPrismaClient, query: ReportQuery) {
  const saleWhere: Record<string, unknown> = {
    status: { in: ["COMPLETED", "PARTIAL"] },
    createdAt: { gte: query.dateFrom, lte: query.dateTo },
  };
  if (query.storeId) saleWhere.storeId = query.storeId;

  // Revenue totals
  const revenue = await db.sale.aggregate({
    where: saleWhere,
    _sum: { grandTotal: true, discountAmount: true, taxTotal: true },
    _count: true,
  });

  // Cost of goods sold (sum of costPrice × quantity from sale items)
  const saleItems = await db.saleItem.findMany({
    where: { sale: saleWhere },
    select: { costPrice: true, quantity: true, lineTotal: true },
  });

  const totalCOGS = saleItems.reduce(
    (sum, item) => sum + Number(item.costPrice) * item.quantity,
    0,
  );
  const totalRevenue = Number(revenue._sum.grandTotal ?? 0);

  // Expenses in the same period
  const expenseWhere: Record<string, unknown> = {
    date: { gte: query.dateFrom, lte: query.dateTo },
  };
  if (query.storeId) expenseWhere.storeId = query.storeId;

  const expenses = await db.expense.aggregate({
    where: expenseWhere,
    _sum: { amount: true },
    _count: true,
  });

  const totalExpenses = Number(expenses._sum.amount ?? 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Product-level profit breakdown (top 10 most profitable)
  const productProfit = await db.saleItem.groupBy({
    by: ["productId"],
    where: { sale: saleWhere },
    _sum: { lineTotal: true, quantity: true },
    orderBy: { _sum: { lineTotal: "desc" } },
    take: 10,
  });

  const productIds = productProfit.map((p) => p.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, costPrice: true },
  });
  const prodMap = new Map(products.map((p) => [p.id, p]));

  return {
    period: { from: query.dateFrom, to: query.dateTo },
    summary: {
      totalRevenue: totalRevenue.toFixed(2),
      totalCOGS: totalCOGS.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      grossMargin: grossMargin.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netProfit: netProfit.toFixed(2),
      netMargin: netMargin.toFixed(2),
      saleCount: revenue._count,
      expenseCount: expenses._count,
    },
    topProfitProducts: productProfit.map((p) => {
      const prod = prodMap.get(p.productId);
      const revenue = Number(p._sum.lineTotal ?? 0);
      const cost = Number(prod?.costPrice ?? 0) * (p._sum.quantity ?? 0);
      return {
        productId: p.productId,
        name: prod?.name ?? "Unknown",
        sku: prod?.sku ?? "",
        revenue: revenue.toFixed(2),
        cost: cost.toFixed(2),
        profit: (revenue - cost).toFixed(2),
        qtySold: p._sum.quantity ?? 0,
      };
    }),
  };
}
