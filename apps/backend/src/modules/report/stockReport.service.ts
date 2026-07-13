import { TenantPrismaClient } from "../../config/database";

interface StockReportQuery {
  storeId?: string;
}

export async function getStockReport(db: TenantPrismaClient, query: StockReportQuery) {
  const stockWhere: Record<string, unknown> = {};
  if (query.storeId) stockWhere.storeId = query.storeId;

  // Overall stock counts
  const totalItems = await db.storeStock.count({ where: stockWhere });
  const outOfStock = await db.storeStock.count({
    where: { ...stockWhere, quantity: 0 },
  });

  // Total stock value (quantity × costPrice)
  const stockWithCost = await db.storeStock.findMany({
    where: { ...stockWhere, quantity: { gt: 0 } },
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true, sellPrice: true } },
      variant: { select: { id: true, name: true, costPrice: true, sellPrice: true } },
      store: { select: { id: true, name: true } },
    },
  });

  let totalCostValue = 0;
  let totalSellValue = 0;

  for (const stock of stockWithCost) {
    const cost = stock.variant?.costPrice
      ? Number(stock.variant.costPrice)
      : Number(stock.product.costPrice);
    const sell = stock.variant?.sellPrice
      ? Number(stock.variant.sellPrice)
      : Number(stock.product.sellPrice);

    totalCostValue += cost * stock.quantity;
    totalSellValue += sell * stock.quantity;
  }

  // Low stock items (quantity > 0 AND quantity <= threshold)
  const lowStockItems = stockWithCost.filter(
    (s) => s.quantity > 0 && s.quantity <= s.lowStockThreshold,
  );

  // Stock by store breakdown
  const byStore = await db.storeStock.groupBy({
    by: ["storeId"],
    where: stockWhere,
    _sum: { quantity: true },
    _count: true,
  });

  const storeIds = byStore.map((s) => s.storeId);
  const stores = await db.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true, code: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  // Top stocked products
  const topStocked = await db.storeStock.groupBy({
    by: ["productId"],
    where: stockWhere,
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 10,
  });

  const topProductIds = topStocked.map((t) => t.productId);
  const topProducts = await db.product.findMany({
    where: { id: { in: topProductIds } },
    select: { id: true, name: true, sku: true },
  });
  const topProdMap = new Map(topProducts.map((p) => [p.id, p]));

  return {
    summary: {
      totalItems,
      outOfStock,
      lowStockCount: lowStockItems.length,
      totalCostValue: totalCostValue.toFixed(2),
      totalSellValue: totalSellValue.toFixed(2),
      potentialProfit: (totalSellValue - totalCostValue).toFixed(2),
    },
    byStore: byStore.map((s) => ({
      storeId: s.storeId,
      storeName: storeMap.get(s.storeId)?.name ?? "Unknown",
      storeCode: storeMap.get(s.storeId)?.code ?? "",
      totalQty: s._sum.quantity ?? 0,
      itemCount: s._count,
    })),
    topStocked: topStocked.map((t) => ({
      productId: t.productId,
      name: topProdMap.get(t.productId)?.name ?? "Unknown",
      sku: topProdMap.get(t.productId)?.sku ?? "",
      totalQty: t._sum.quantity ?? 0,
    })),
    lowStockItems: lowStockItems.slice(0, 20).map((s) => ({
      storeId: s.storeId,
      storeName: s.store.name,
      productId: s.productId,
      productName: s.product.name,
      sku: s.product.sku,
      quantity: s.quantity,
      threshold: s.lowStockThreshold,
      costPrice: s.variant?.costPrice ?? s.product.costPrice,
      sellPrice: s.variant?.sellPrice ?? s.product.sellPrice,
    })),
  };
}
