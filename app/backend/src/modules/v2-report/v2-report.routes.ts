// RX POS v2 — Reporting & Dashboard routes //
// All routes are tenant-scoped and RBAC-gated. The dashboard endpoint
// is gated by an ANY-of policy across the family of HR/sales report
// permissions so that any manager-level user can render the
// consolidated summary widget. Module-specific report endpoints use
// the corresponding fine-grained v2 permission.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { validate } from "../../middleware/validate";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./v2-report.controller";
import {
  activityReportSchema,
  attendanceReportSchema,
  dashboardSummarySchema,
  employeeReportSchema,
  leaveReportSchema,
  payrollReportSchema,
} from "./v2-report.validation";

const router = Router();

router.use(authenticate, tenantContext);

router.get(
  "/dashboard",
  requireAnyPermission(
    PERMISSIONS_V2.REPORTS_SALES_READ,
    PERMISSIONS_V2.REPORTS_HR_ATTENDANCE_READ,
    PERMISSIONS_V2.REPORTS_HR_PAYROLL_READ,
    PERMISSIONS_V2.HR_EMPLOYEES_READ,
  ),
  validate(dashboardSummarySchema, "query"),
  controller.dashboard,
);

router.get(
  "/employees",
  requirePermission(PERMISSIONS_V2.HR_EMPLOYEES_READ),
  validate(employeeReportSchema, "query"),
  controller.employees,
);

router.get(
  "/attendance",
  requirePermission(PERMISSIONS_V2.REPORTS_HR_ATTENDANCE_READ),
  validate(attendanceReportSchema, "query"),
  controller.attendance,
);

router.get(
  "/leave",
  requirePermission(PERMISSIONS_V2.REPORTS_HR_ATTENDANCE_READ),
  validate(leaveReportSchema, "query"),
  controller.leave,
);

router.get(
  "/payroll",
  requirePermission(PERMISSIONS_V2.REPORTS_HR_PAYROLL_READ),
  validate(payrollReportSchema, "query"),
  controller.payroll,
);

router.get(
  "/activity",
  requirePermission(PERMISSIONS_V2.TENANT_AUDIT_READ),
  validate(activityReportSchema, "query"),
  controller.activity,
);

export default router;
