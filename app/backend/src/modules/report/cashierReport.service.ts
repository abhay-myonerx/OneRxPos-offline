import { TenantPrismaClient } from "../../config/database";
import type { CashierReportQuery } from "./report.validation";

export async function getCashierReport(db: TenantPrismaClient, query: CashierReportQuery) {
  const saleWhere: Record<string, unknown> = {
    status: { in: ["COMPLETED", "PARTIAL"] },
    createdAt: { gte: query.dateFrom, lte: query.dateTo },
  };
  if (query.storeId) saleWhere.storeId = query.storeId;
  if (query.cashierId) saleWhere.cashierId = query.cashierId;

  // Per-cashier breakdown
  const byCashier = await db.sale.groupBy({
    by: ["cashierId"],
    where: saleWhere,
    _sum: { grandTotal: true, discountAmount: true },
    _count: true,
    _avg: { grandTotal: true },
    orderBy: { _sum: { grandTotal: "desc" } },
  });

  // Enrich with cashier names
  const cashierIds = byCashier.map((c) => c.cashierId);
  const cashiers = await db.user.findMany({
    where: { id: { in: cashierIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const cashierMap = new Map(cashiers.map((c) => [c.id, c]));

  // Shift data for the period
  const shiftWhere: Record<string, unknown> = {
    openedAt: { gte: query.dateFrom, lte: query.dateTo },
  };
  if (query.storeId) shiftWhere.storeId = query.storeId;
  if (query.cashierId) shiftWhere.userId = query.cashierId;

  const shifts = await db.cashierShift.findMany({
    where: shiftWhere,
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
      store: { select: { id: true, name: true } },
      _count: { select: { sales: true } },
    },
    orderBy: { openedAt: "desc" },
    take: 50,
  });

  return {
    period: { from: query.dateFrom, to: query.dateTo },
    cashierPerformance: byCashier.map((c) => {
      const cashier = cashierMap.get(c.cashierId);
      return {
        cashierId: c.cashierId,
        name: cashier ? `${cashier.firstName} ${cashier.lastName}` : "Unknown",
        email: cashier?.email ?? "",
        saleCount: c._count,
        revenue: c._sum.grandTotal?.toString() ?? "0",
        discounts: c._sum.discountAmount?.toString() ?? "0",
        avgSale: c._avg.grandTotal?.toString() ?? "0",
      };
    }),
    recentShifts: shifts.map((s) => ({
      shiftId: s.id,
      cashier: `${s.user.firstName} ${s.user.lastName}`,
      store: s.store.name,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingCash: s.openingCash?.toString() ?? "0",
      closingCash: s.closingCash?.toString() ?? null,
      expectedCash: s.expectedCash?.toString() ?? null,
      difference: s.difference?.toString() ?? null,
      salesCount: s._count.sales,
    })),
  };
}
