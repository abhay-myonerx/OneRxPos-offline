// Express application setup — middleware stack, route mounting, error handling

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { requestLogger } from "./middleware/requestLogger";
import { demoRateLimiter } from "./middleware/demoRateLimiter";
import { rateLimiter } from "./middleware/rateLimiter";
import { demoGuard } from "./middleware/demoGuard";
import { errorHandler } from "./middleware/errorHandler";

// ── Route imports ──────────────────────────────────────────────────────
// Uncomment each line as the module is built:
//
import authRoutes from "./modules/auth/auth.routes";
import setupRoutes from "./modules/setup/setup.routes";
import tenantRoutes from "./modules/tenant/tenant.routes";
import storeRoutes from "./modules/store/store.routes";
import userRoutes from "./modules/user/user.routes";
import productRoutes from "./modules/product/product.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import saleRoutes from "./modules/sale/sale.routes";
import paymentRoutes from "./modules/payment/payment.routes";
import customerRoutes from "./modules/customer/customer.routes";
import supplierRoutes from "./modules/supplier/supplier.routes";
import purchaseRoutes from "./modules/purchase/purchase.routes";
import expenseRoutes from "./modules/expense/expense.routes";
import reportRoutes from "./modules/report/report.routes";
import superAdminRoutes from "./modules/super-admin/super-admin.routes";
import auditRoutes from "./modules/audit/audit.routes";
import receiptRoutes from "./modules/receipt/receipt.routes";
import rbacRoutes from "./modules/rbac/rbac.routes";
import departmentRoutes from "./modules/department/department.routes";
import designationRoutes from "./modules/designation/designation.routes";
import employeeRoutes from "./modules/employee/employee.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import shiftRoutes from "./modules/shift/shift.routes";
import leaveRoutes from "./modules/leave/leave.routes";
import holidayRoutes from "./modules/holiday/holiday.routes";
import payrollRoutes from "./modules/payroll/payroll.routes";
import essRoutes from "./modules/ess/ess.routes";
import brandRoutes from "./modules/brand/brand.routes";
import levyRoutes from "./modules/levy/levy.routes";
import v2ReportRoutes from "./modules/v2-report/v2-report.routes";
import storeV2Routes from "./modules/store/store.v2.routes";
import notificationRoutes from "./modules/notification/notification.routes";
import messagingRoutes from "./modules/messaging/messaging.routes";
import promotionRoutes from "./modules/promotion/promotion.routes";
import importRoutes from "./modules/import/import.routes";
import syncRoutes from "./modules/sync/sync.routes";
import licenseRoutes from "./modules/licensing/licensing.routes";
import posAuthRoutes from "./modules/pos-auth/pos-auth.routes";
import barcodeTemplateRoutes from "./modules/barcode/barcode-template.routes";
import cashierShiftRoutes from "./modules/cashier-shift/cashier-shift.routes";
import drugProductRoutes from "./modules/drug/drug.routes";
import narcoticRoutes from "./modules/narcotic/narcotic.routes";
import hardwareRoutes from "./modules/hardware/hardware.routes";
import deviceProfileRoutes from "./modules/hardware/device-profile.routes";
import paymentTerminalRoutes from "./modules/payment-terminal/payment-terminal.routes";

// Per-tenant module enable/disable gate.
// Mounted as the 5th auth-chain layer on every v2 route group.
import { moduleEnabled } from "./middleware/moduleEnabled";
import { MODULE } from "./shared/settings/enabledModules";

const app = express();

// ── Security ───────────────────────────────────────────────────────────────
// Helmet — explicit production-grade headers. This is a JSON API: lock CSP
// down to self only, enable HSTS preload, and refuse framing entirely.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    hsts: {
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
  }),
);

// CORS — explicit origin allowlist; reject unknown origins. CORS_ORIGINS must
// be set to the deployed frontend origin in production (no wildcard).
const allowedOrigins = config.CORS_ORIGINS.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / curl / server-to-server (no Origin header) — allow.
      if (!origin) return callback(null, true);
      // The packaged Electron desktop shell serves its renderer from our own
      // custom `app://` scheme (see rx-pos-desktop app-protocol.ts) and talks
      // to this locally-spawned store-node cross-origin. That origin can only
      // originate from our own signed bundle — no remote browser can forge an
      // `app://` Origin — so allow the scheme. Without this the store-node
      // rejects every request from its own UI (CORS: no ACAO header) and the
      // packaged app can't reach its backend.
      if (origin.startsWith("app://")) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

// ── Parsing & compression ────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Request logging (before routes, after parsing) ───────────────────────────
app.use(requestLogger);

// ── Demo rate limiter (stricter, before regular limiter) ─────────────────────
app.use(demoRateLimiter());

// ── Rate limiting (before routes) ─────────────────────────────────────────────
app.use(rateLimiter());

// ── Demo mode guard (after body parsing, before routes) ───────────────────────
app.use(demoGuard);

// ── Health check (no auth required) ───────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    },
  });
});

// ── API v1 Routes ────────────────────────────────────────────────────────────
// Uncomment each line as the module is built:
//
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/setup", setupRoutes);
app.use("/api/v1/tenants", tenantRoutes);
app.use("/api/v1/stores", storeRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/sales", saleRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/customers", customerRoutes);
app.use("/api/v1/suppliers", supplierRoutes);
app.use("/api/v1/purchases", purchaseRoutes);
app.use("/api/v1/expenses", expenseRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/super-admin", superAdminRoutes);
app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/receipts", receiptRoutes);
app.use("/api/v1/promotions", promotionRoutes);
app.use("/api/v1/import", importRoutes);
app.use("/api/v1/rbac", rbacRoutes);

// Barcode Layer 2 — learned label templates (Phase 1.3c). Reads are
// till-readable (any authenticated user; decode pipeline fetches on POS load);
// writes are the admin-gated "learn a label" tool (SETTINGS_MANAGE).
app.use("/api/v1/barcode-templates", barcodeTemplateRoutes);

// Till session — cash sale end-to-end (Phase 1.4). Open/close a CashierShift,
// record paid-in/out cash movements, and reconcile the drawer (expected vs
// counted over/short). Tenant-scoped; a cashier runs their own drawer.
app.use("/api/v1/cashier-shifts", cashierShiftRoutes);

// Drug identity catalog (Phase 2.1 — Pharmacy plugin). GLOBAL Health-Canada DPD
// reference data (DrugProduct), searchable by DIN / brand / ingredient. Reads
// require auth only (not tenant-scoped — shared across tenants). The tenant
// product-extension writes (link a DIN / schedule override) live on the product
// router. The Drug UI is gated on the tenant's `pharmacy` sector being enabled.
app.use("/api/v1/drug-products", drugProductRoutes);

// Controlled substances / narcotic log (Phase 2.4 — Pharmacy plugin). A perpetual
// narcotic count DERIVED from the StockMovement ledger + physical-count
// reconciliation + loss/theft/destruction events, PII-FREE. Reads gate on
// INVENTORY_READ, writes on INVENTORY_WRITE. Tenant-scoped; the Narcotic Log UI
// is gated on the tenant's `pharmacy` sector being enabled.
app.use("/api/v1/narcotic", narcoticRoutes);

// Peripheral hardware I/O (Phase 2.9 — HAL). Network receipt printing via a
// backend TCP proxy so every client surface (incl. iOS, which has no raw-socket
// API) can print. Auth-only; no tenant scope on this route.
app.use("/api/v1/hardware", hardwareRoutes);

// Peripheral device profiles (Phase 2.9.5 — Driver Panel). Tenant-scoped CRUD;
// reads till-open, writes SETTINGS_MANAGE.
app.use("/api/v1/device-profiles", deviceProfileRoutes);

// Semi-integrated payment terminal (Phase 2.10.1). Provider-agnostic: mock by
// default, real processor adapters swap in behind the same interface. No card
// data ever passes through the app.
app.use("/api/v1/payment-terminal", paymentTerminalRoutes);

// ── API v2 Routes ────────────────────────────────────────────────────────────
// HRM modules — see docs/v2/hrm-deep-dives/1.hrm-employees.md
// `moduleEnabled(slug)` is applied INSIDE each router, after
// `authenticate`+`tenantContext`, because the gate needs `req.tenantId`
// (set by tenantContext) to read the per-tenant toggle. Mounting it
// here — ahead of the router's own auth chain — left `req.tenantId`
// undefined, so the gate fell through and never fired. ESS applies the
// gate per-route with the OWNING module's slug (e.g. /me/payslips →
// hr.payroll), so disabling a back-office module also disables its ESS
// projection.
app.use("/api/v2/hr/departments", departmentRoutes);
app.use("/api/v2/hr/designations", designationRoutes);
app.use("/api/v2/hr/employees", employeeRoutes);
app.use("/api/v2/hr/attendance", attendanceRoutes);
app.use("/api/v2/hr/shifts", shiftRoutes);
app.use("/api/v2/hr/leave", leaveRoutes);
app.use("/api/v2/hr/holidays", holidayRoutes);
app.use("/api/v2/hr/payroll", payrollRoutes);
app.use("/api/v2/me", essRoutes);

// Store v2 endpoints (geolocation / ip-whitelist) — Phase 21a / OI-030.
app.use("/api/v2/stores", storeV2Routes);

// Catalog modules — see docs/v2/4.RX-POS-v2-ERD.md §5
app.use("/api/v2/brands", moduleEnabled(MODULE.BRANDS), brandRoutes);

// Pricing Brain — Levy CRUD (Phase 1.2). No per-tenant module toggle yet;
// levies are core tax-engine config, not an optional feature.
app.use("/api/v2/levies", levyRoutes);

// Reports & Dashboard
app.use("/api/v2/reports", moduleEnabled(MODULE.REPORTS_V2), v2ReportRoutes);

// In-app real-time notifications — inbox (all roles) + privileged broadcast.
// The inbox is intentionally NOT behind the `notifications` module toggle:
// that toggle governs outbound provider sends (email/SMS), whereas the in-app
// inbox is core UX every role relies on.
app.use("/api/v2/notifications", notificationRoutes);

// 3H.1 outbound messaging (email) — test-send, audit log, resend.
app.use("/api/v2/messaging", messagingRoutes);

// Store-node <-> cloud sync — authenticated with its own bearer-JWT
// credential (`syncAuth`), distinct from the user `authenticate` middleware.
// See Phase 0.4 Task 12.
app.use("/api/v2/sync", syncRoutes);

// Cloud licensing — activate/validate a license key against a device
// fingerprint, returning a signed lease. See Phase 0.5 Task 8.
// Note: GET /status is added to this same router in Task 12.
app.use("/api/v2/license", licenseRoutes);

// Till identity/auth — device enrollment, PIN login, manager override.
// See Phase 1.1 (docs/superpowers/plans/2026-07-03-phase1.1-till-identity-auth.md).
app.use("/api/v2/pos", posAuthRoutes);

// ── 404 — No matching route ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Route not found" },
  });
});

// ── Global error handler (MUST be registered last) ─────────────────────────
app.use(errorHandler);

export default app;
