import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";
import * as ctrl from "./report.controller";

const router = Router();

router.use(authenticate, tenantContext);

// Admin / Manager / Accountant reports. Gated on the v2 dotted catalogue
// (the same strings shipped in /auth/me) so v2-only roles such as
// ACCOUNTANT — who hold reports.* read grants but no legacy v1
// permissions — are no longer 403'd. Each report uses its specific
// read grant rather than a single coarse report:read.
router.get("/sales", requirePermission(PERMISSIONS_V2.REPORTS_SALES_READ), ctrl.salesReport);
router.get("/profit", requirePermission(PERMISSIONS_V2.REPORTS_PROFIT_READ), ctrl.profitReport);
router.get("/stock", requirePermission(PERMISSIONS_V2.REPORTS_STOCK_READ), ctrl.stockReport);
router.get("/cashier", requirePermission(PERMISSIONS_V2.REPORTS_CASHIER_READ), ctrl.cashierReport);
router.get("/daily", requirePermission(PERMISSIONS_V2.REPORTS_SALES_READ), ctrl.dailyRevenue);
// AR aging (3H.6)
router.get("/ar-aging", requirePermission(PERMISSIONS_V2.REPORTS_AR_READ), ctrl.arAgingReport);

// Cashier self-service — only their own data.
router.get(
  "/my-stats",
  requireAnyPermission(PERMISSIONS_V2.CASHIER_SHIFT_READ_OWN, PERMISSIONS_V2.REPORTS_CASHIER_READ),
  ctrl.myCashierStats,
);

// Pharmacy reports (Phase 2.5) — read with the sales read grant, PII-free.
router.get(
  "/pharmacy/narcotic",
  requirePermission(PERMISSIONS_V2.REPORTS_SALES_READ),
  ctrl.pharmacyNarcoticReport,
);
router.get(
  "/pharmacy/rx-sales",
  requirePermission(PERMISSIONS_V2.REPORTS_SALES_READ),
  ctrl.pharmacyRxSalesReport,
);
router.get(
  "/pharmacy/schedules",
  requirePermission(PERMISSIONS_V2.REPORTS_SALES_READ),
  ctrl.pharmacyScheduleReport,
);
router.get(
  "/pharmacy/export/narcotic",
  requirePermission(PERMISSIONS_V2.REPORTS_EXPORT),
  ctrl.exportPharmacyNarcoticCSV,
);
router.get(
  "/pharmacy/export/rx-sales",
  requirePermission(PERMISSIONS_V2.REPORTS_EXPORT),
  ctrl.exportPharmacyRxSalesCSV,
);
router.get(
  "/pharmacy/export/schedules",
  requirePermission(PERMISSIONS_V2.REPORTS_EXPORT),
  ctrl.exportPharmacyScheduleCSV,
);

// CSV exports — require the export grant.
router.get("/export/sales", requirePermission(PERMISSIONS_V2.REPORTS_EXPORT), ctrl.exportSalesCSV);
router.get(
  "/export/profit",
  requirePermission(PERMISSIONS_V2.REPORTS_EXPORT),
  ctrl.exportProfitCSV,
);
router.get("/export/stock", requirePermission(PERMISSIONS_V2.REPORTS_EXPORT), ctrl.exportStockCSV);
router.get(
  "/export/cashier",
  requirePermission(PERMISSIONS_V2.REPORTS_EXPORT),
  ctrl.exportCashierCSV,
);
router.get("/export/ar-aging", requirePermission(PERMISSIONS_V2.REPORTS_EXPORT), ctrl.exportArAgingCSV);

export default router;
