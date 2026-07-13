export interface ReportQuery {
  storeId?: string;
  dateFrom: string;
  dateTo: string;
  groupBy?: "day" | "week" | "month";
}

export interface SalesReportData {
  period: { from: string; to: string };
  summary: {
    totalSales: number;
    totalRevenue: string;
    totalTax: string;
    totalDiscount: string;
    totalPaid: string;
    totalDue: string;
    avgSaleValue: string;
  };
  byPaymentMethod: { method: string; total: string; count: number }[];
  topProducts: { productId: string; name: string; sku: string; qtySold: number; revenue: string }[];
  byStatus: { status: string; count: number; total: string }[];
}

export interface ProfitReportData {
  period: { from: string; to: string };
  summary: {
    totalRevenue: string;
    totalCOGS: string;
    grossProfit: string;
    grossMargin: string;
    totalExpenses: string;
    netProfit: string;
    netMargin: string;
    saleCount: number;
    expenseCount: number;
  };
  topProfitProducts: {
    productId: string;
    name: string;
    sku: string;
    revenue: string;
    cost: string;
    profit: string;
    qtySold: number;
  }[];
}

export interface StockReportData {
  summary: {
    totalItems: number;
    outOfStock: number;
    lowStockCount: number;
    totalCostValue: string;
    totalSellValue: string;
    potentialProfit: string;
  };
  byStore: {
    storeId: string;
    storeName: string;
    storeCode: string;
    totalQty: number;
    itemCount: number;
  }[];
  topStocked: { productId: string; name: string; sku: string; totalQty: number }[];
  lowStockItems: {
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    sku: string;
    quantity: number;
    threshold: number;
  }[];
}

export interface CashierReportData {
  period: { from: string; to: string };
  cashierPerformance: {
    cashierId: string;
    name: string;
    email: string;
    saleCount: number;
    revenue: string;
    discounts: string;
    avgSale: string;
  }[];
  recentShifts: {
    shiftId: string;
    cashier: string;
    store: string;
    openedAt: string;
    closedAt?: string | null;
    openingCash: string;
    closingCash?: string | null;
    expectedCash?: string | null;
    difference?: string | null;
    salesCount: number;
  }[];
}

// 3H.6 AR aging report
export interface ArAgingBuckets {
  current: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
}
export interface ArAgingRow extends ArAgingBuckets {
  customerId: string;
  customerName: string;
  currentBalance: number;
}
export interface ArAgingReportData {
  asOf: string;
  rows: ArAgingRow[];
  summary: ArAgingBuckets;
}
