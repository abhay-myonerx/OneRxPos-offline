import { Request, Response, NextFunction } from "express";
import { getSalesReport } from "./salesReport.service";
import { getProfitReport } from "./profitReport.service";
import { getStockReport } from "./stockReport.service";
import { getCashierReport } from "./cashierReport.service";
import { getDailyRevenueSeries, getCashierDailyStats } from "./salesReport.service";
import {
  getNarcoticReport,
  getRxSalesReport,
  getScheduleBreakdown,
} from "./pharmacyReport.service";
import { reportQuerySchema, cashierReportSchema, arAgingQuerySchema } from "./report.validation";
import { getArAgingReport } from "./ar-report.service";

export async function salesReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const result = await getSalesReport(req.db!, query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function profitReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const result = await getProfitReport(req.db!, query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function stockReport(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = req.query.storeId as string | undefined;
    const result = await getStockReport(req.db!, { storeId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function cashierReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = cashierReportSchema.parse(req.query);
    const result = await getCashierReport(req.db!, query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /reports/daily?days=30&storeId=xxx
export async function dailyRevenue(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const storeId = req.query.storeId as string | undefined;
    const result = await getDailyRevenueSeries(req.db!, days, storeId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /reports/my-stats?days=14
export async function myCashierStats(req: Request, res: Response, next: NextFunction) {
  try {
    const days = Math.min(parseInt(req.query.days as string) || 14, 30);
    const result = await getCashierDailyStats(req.db!, req.user!.id, days);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── CSV Export helpers ──────────────────────────────────────────────────────

function escapeCSV(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCSV).join(",")).join("\r\n");
}

// GET /reports/ar-aging — accounts-receivable aging (Current/31-60/61-90/90+).
export async function arAgingReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = arAgingQuerySchema.parse(req.query);
    const data = await getArAgingReport(req.db!, query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /reports/export/ar-aging — the aging report as CSV.
export async function exportArAgingCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = arAgingQuerySchema.parse(req.query);
    const data = await getArAgingReport(req.db!, query);
    const rows: unknown[][] = [
      ["AR Aging Report", `as of ${data.asOf}`],
      [],
      ["Customer", "Current", "31-60", "61-90", "90+", "Total", "Balance"],
      ...data.rows.map((r) => [
        r.customerName,
        r.current,
        r.d31_60,
        r.d61_90,
        r.d90plus,
        r.total,
        r.currentBalance,
      ]),
      [],
      ["TOTAL", data.summary.current, data.summary.d31_60, data.summary.d61_90, data.summary.d90plus, data.summary.total, ""],
    ];
    sendCSV(res, `ar-aging-${data.asOf.slice(0, 10)}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

function sendCSV(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("﻿" + csv); // UTF-8 BOM for Excel compatibility
}

// GET /reports/export/sales
export async function exportSalesCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const data = await getSalesReport(req.db!, query);

    const rows: unknown[][] = [
      ["Sales Report", `${query.dateFrom} to ${query.dateTo}`],
      [],
      ["SUMMARY"],
      ["Total Sales", data.summary.totalSales],
      ["Total Revenue", data.summary.totalRevenue],
      ["Total Tax", data.summary.totalTax],
      ["Total Discount", data.summary.totalDiscount],
      ["Total Paid", data.summary.totalPaid],
      ["Total Due", data.summary.totalDue],
      ["Avg Sale Value", data.summary.avgSaleValue],
      [],
      ["TOP PRODUCTS"],
      ["Product", "SKU", "Qty Sold", "Revenue"],
      ...data.topProducts.map((p) => [p.name, p.sku, p.qtySold, p.revenue]),
      [],
      ["PAYMENT METHODS"],
      ["Method", "Total", "Count"],
      ...data.byPaymentMethod.map((p) => [p.method, p.total, p.count]),
      [],
      ["STATUS BREAKDOWN"],
      ["Status", "Count", "Total"],
      ...data.byStatus.map((s) => [s.status, s.count, s.total]),
    ];

    sendCSV(res, `sales-report-${query.dateFrom}-${query.dateTo}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

// GET /reports/export/profit
export async function exportProfitCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const data = await getProfitReport(req.db!, query);
    const s = data.summary;

    const rows: unknown[][] = [
      ["Profit Report", `${query.dateFrom} to ${query.dateTo}`],
      [],
      ["SUMMARY"],
      ["Total Revenue", s.totalRevenue],
      ["Total COGS", s.totalCOGS],
      ["Gross Profit", s.grossProfit],
      ["Total Expenses", s.totalExpenses],
      ["Net Profit", s.netProfit],
      ["Gross Margin", s.grossMargin],
      ["Net Margin", s.netMargin],
      [],
      ["TOP PROFIT PRODUCTS"],
      ["Product", "Revenue", "Cost", "Profit", "Qty Sold"],
      ...data.topProfitProducts.map((p) => [p.name, p.revenue, p.cost, p.profit, p.qtySold]),
    ];

    sendCSV(res, `profit-report-${query.dateFrom}-${query.dateTo}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

// GET /reports/export/stock
export async function exportStockCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const storeId = req.query.storeId as string | undefined;
    const data = await getStockReport(req.db!, { storeId });
    const s = data.summary;

    const rows: unknown[][] = [
      ["Stock Report", new Date().toISOString().slice(0, 10)],
      [],
      ["SUMMARY"],
      ["Total Items", s.totalItems],
      ["Out of Stock", s.outOfStock],
      ["Low Stock Items", s.lowStockCount],
      ["Total Cost Value", s.totalCostValue],
      ["Total Sell Value", s.totalSellValue],
      ["Potential Profit", s.potentialProfit],
      [],
      ["LOW STOCK ITEMS"],
      ["Product", "Store", "Qty", "Threshold", "Cost Price", "Sell Price"],
      ...data.lowStockItems.map((i) => [
        i.productName,
        i.storeName,
        i.quantity,
        i.threshold,
        i.costPrice,
        i.sellPrice,
      ]),
    ];

    sendCSV(res, `stock-report-${new Date().toISOString().slice(0, 10)}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

// GET /reports/export/cashier
export async function exportCashierCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = cashierReportSchema.parse(req.query);
    const data = await getCashierReport(req.db!, query);

    const rows: unknown[][] = [
      ["Cashier Performance Report", `${query.dateFrom} to ${query.dateTo}`],
      [],
      ["CASHIER PERFORMANCE"],
      ["Cashier", "Email", "Sales", "Revenue", "Discounts", "Avg Sale"],
      ...data.cashierPerformance.map((c) => [
        c.name,
        c.email,
        c.saleCount,
        c.revenue,
        c.discounts,
        c.avgSale,
      ]),
      [],
      ["RECENT SHIFTS"],
      [
        "Cashier",
        "Store",
        "Opened At",
        "Closed At",
        "Opening Cash",
        "Closing Cash",
        "Expected",
        "Difference",
        "Sales Count",
      ],
      ...data.recentShifts.map((s) => [
        s.cashier,
        s.store,
        new Date(s.openedAt).toLocaleString(),
        s.closedAt ? new Date(s.closedAt).toLocaleString() : "Open",
        s.openingCash,
        s.closingCash ?? "",
        s.expectedCash ?? "",
        s.difference ?? "",
        s.salesCount,
      ]),
    ];

    sendCSV(res, `cashier-report-${query.dateFrom}-${query.dateTo}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

// ── Pharmacy reports (Phase 2.5) ─────────────────────────────────────────────

const day = (d: Date): string => new Date(d).toISOString().slice(0, 10);

// GET /reports/pharmacy/narcotic
export async function pharmacyNarcoticReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const result = await getNarcoticReport(req.db!, query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /reports/pharmacy/rx-sales
export async function pharmacyRxSalesReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const result = await getRxSalesReport(req.db!, query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /reports/pharmacy/schedules
export async function pharmacyScheduleReport(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const result = await getScheduleBreakdown(req.db!, query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /reports/pharmacy/export/narcotic
export async function exportPharmacyNarcoticCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const data = await getNarcoticReport(req.db!, query);

    const rows: unknown[][] = [
      ["Narcotic Movement / Discrepancy Report", `${day(query.dateFrom)} to ${day(query.dateTo)}`],
      [],
      ["Product", "DIN", "Dispensed", "Received", "Destroyed", "Lost", "Stolen", "Discrepancy", "On Hand"],
      ...data.rows.map((r) => [
        r.name,
        r.din ?? "",
        r.dispensed,
        r.received,
        r.destroyed,
        r.lost,
        r.stolen,
        r.discrepancy,
        r.onHand,
      ]),
    ];

    sendCSV(res, `narcotic-report-${day(query.dateFrom)}-${day(query.dateTo)}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

// GET /reports/pharmacy/export/rx-sales
export async function exportPharmacyRxSalesCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const data = await getRxSalesReport(req.db!, query);

    const rows: unknown[][] = [
      ["Rx Sales Report", `${day(query.dateFrom)} to ${day(query.dateTo)}`],
      [],
      ["Date", "Rx Count", "Copay Total"],
      ...data.byDay.map((d) => [d.day, d.rxCount, d.copayTotal]),
      [],
      ["TOTAL", data.totals.rxCount, data.totals.copayTotal],
    ];

    sendCSV(res, `rx-sales-report-${day(query.dateFrom)}-${day(query.dateTo)}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}

// GET /reports/pharmacy/export/schedules
export async function exportPharmacyScheduleCSV(req: Request, res: Response, next: NextFunction) {
  try {
    const query = reportQuerySchema.parse(req.query);
    const data = await getScheduleBreakdown(req.db!, query);

    const rows: unknown[][] = [
      ["Schedule-Category Breakdown", `${day(query.dateFrom)} to ${day(query.dateTo)}`],
      [],
      ["Category", "Quantity", "Revenue"],
      ...data.rows.map((r) => [r.category, r.quantity, r.revenue]),
    ];

    sendCSV(res, `schedule-report-${day(query.dateFrom)}-${day(query.dateTo)}.csv`, buildCSV(rows));
  } catch (err) {
    next(err);
  }
}
