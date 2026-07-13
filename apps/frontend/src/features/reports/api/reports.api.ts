import { baseApi } from "@/store/base-api";
import type { ApiResponse } from "@/types/common/api-response.types";
import type {
  ReportQuery,
  SalesReportData,
  ProfitReportData,
  StockReportData,
  CashierReportData,
  ArAgingReportData,
} from "../types/report.types";

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
  sales: number;
}

// ── Pharmacy reports (Phase 2.5) ──────────────────────────────────────────────
export interface NarcoticReportRow {
  productId: string;
  name: string;
  din: string | null;
  dispensed: number;
  received: number;
  destroyed: number;
  lost: number;
  stolen: number;
  discrepancy: number;
  onHand: number;
}
export interface RxSalesReportData {
  byDay: { day: string; rxCount: number; copayTotal: number }[];
  totals: { rxCount: number; copayTotal: number };
}
export interface ScheduleBreakdownRow {
  category: "NEEDS_RX" | "NARCOTIC" | "BEHIND_COUNTER" | "OPEN";
  quantity: number;
  revenue: number;
}
export interface PharmacyReportQuery {
  storeId?: string;
  dateFrom: string;
  dateTo: string;
}

export interface CashierDashboardStats {
  todaySales: number;
  todayRevenue: string;
  series: DailyRevenuePoint[];
}

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSalesReport: build.query<SalesReportData, ReportQuery>({
      query: (params) => ({ url: "/reports/sales", params }),
      transformResponse: (res: ApiResponse<SalesReportData>) => res.data,
    }),
    getProfitReport: build.query<ProfitReportData, ReportQuery>({
      query: (params) => ({ url: "/reports/profit", params }),
      transformResponse: (res: ApiResponse<ProfitReportData>) => res.data,
    }),
    getStockReport: build.query<StockReportData, { storeId?: string }>({
      query: (params) => ({ url: "/reports/stock", params }),
      transformResponse: (res: ApiResponse<StockReportData>) => res.data,
    }),
    getCashierReport: build.query<
      CashierReportData,
      { storeId?: string; cashierId?: string; dateFrom: string; dateTo: string }
    >({
      query: (params) => ({ url: "/reports/cashier", params }),
      transformResponse: (res: ApiResponse<CashierReportData>) => res.data,
    }),
    // 30-day daily revenue series for trend charts (ADMIN / MANAGER)
    getDailyRevenue: build.query<DailyRevenuePoint[], { days?: number; storeId?: string }>({
      query: (params) => ({ url: "/reports/daily", params }),
      transformResponse: (res: ApiResponse<DailyRevenuePoint[]>) => res.data,
    }),
    // Cashier-scoped own daily stats (CASHIER)
    getMyCashierStats: build.query<CashierDashboardStats, { days?: number }>({
      query: (params) => ({ url: "/reports/my-stats", params }),
      transformResponse: (res: ApiResponse<CashierDashboardStats>) => res.data,
    }),
    // ── Pharmacy reports (Phase 2.5) ─────────────────────────────────────────
    getNarcoticReport: build.query<{ rows: NarcoticReportRow[] }, PharmacyReportQuery>({
      query: (params) => ({ url: "/reports/pharmacy/narcotic", params }),
      transformResponse: (res: ApiResponse<{ rows: NarcoticReportRow[] }>) => res.data,
    }),
    getRxSalesReport: build.query<RxSalesReportData, PharmacyReportQuery>({
      query: (params) => ({ url: "/reports/pharmacy/rx-sales", params }),
      transformResponse: (res: ApiResponse<RxSalesReportData>) => res.data,
    }),
    getScheduleBreakdown: build.query<{ rows: ScheduleBreakdownRow[] }, PharmacyReportQuery>({
      query: (params) => ({ url: "/reports/pharmacy/schedules", params }),
      transformResponse: (res: ApiResponse<{ rows: ScheduleBreakdownRow[] }>) => res.data,
    }),
    getArAgingReport: build.query<ArAgingReportData, { asOf?: string; storeId?: string }>({
      query: (params) => ({ url: "/reports/ar-aging", params }),
      transformResponse: (res: ApiResponse<ArAgingReportData>) => res.data,
    }),
  }),
});

export const {
  useGetSalesReportQuery,
  useGetProfitReportQuery,
  useGetStockReportQuery,
  useGetCashierReportQuery,
  useGetDailyRevenueQuery,
  useGetMyCashierStatsQuery,
  useGetNarcoticReportQuery,
  useGetRxSalesReportQuery,
  useGetScheduleBreakdownQuery,
  useGetArAgingReportQuery,
} = reportsApi;
