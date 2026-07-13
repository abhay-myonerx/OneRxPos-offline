// HRM Employee Self-Service routes.
// Per docs/v2/hrm-deep-dives/6.hrm-ess.md + API Reference §28.
//
// Mounted at `/api/v2/me` in `src/app.ts`.
// Auth chain: authenticate → tenantContext → moduleEnabled(<owning module>)
//   → requirePermission → validate.
// `moduleEnabled` uses the OWNING module's slug per route (e.g.
// /me/payslips → hr.payroll), so disabling a back-office module also
// disables its ESS projection — no orphan self-service surface.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./ess.controller";
import {
  attendanceListQuerySchema,
  documentsListQuerySchema,
  holidaysQuerySchema,
  idParamSchema,
  leaveApplySchema,
  leaveBalanceQuerySchema,
  leaveRequestListQuerySchema,
  payslipListQuerySchema,
  profileUpdateSchema,
  punchSchema,
  regularizeSchema,
  shiftsListQuerySchema,
  summaryQuerySchema,
  swapRequestSchema,
  swapRespondSchema,
} from "./ess.validation";

const router = Router();

router.use(authenticate, tenantContext);

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get(
  "/dashboard",
  moduleEnabled(MODULE.HR),
  requirePermission(PERMISSIONS_V2.ESS_PROFILE_READ),
  controller.dashboard,
);

// ─── Profile (28.1 / 28.2) ────────────────────────────────────────────────────

router.get(
  "/profile",
  moduleEnabled(MODULE.HR),
  requirePermission(PERMISSIONS_V2.ESS_PROFILE_READ),
  controller.getProfile,
);

router.patch(
  "/profile",
  moduleEnabled(MODULE.HR),
  requirePermission(PERMISSIONS_V2.ESS_PROFILE_UPDATE),
  validate(profileUpdateSchema, "body"),
  controller.updateProfile,
);

// ─── Attendance (28.3 – 28.6) ─────────────────────────────────────────────────

router.get(
  "/attendance",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_READ),
  validate(attendanceListQuerySchema, "query"),
  controller.listAttendance,
);

router.get(
  "/attendance/today",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_READ),
  controller.today,
);

router.get(
  "/attendance/summary",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_READ),
  validate(summaryQuerySchema, "query"),
  controller.summary,
);

router.post(
  "/attendance/check-in",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_CHECK_IN),
  validate(punchSchema, "body"),
  controller.checkIn,
);

router.post(
  "/attendance/check-out",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_CHECK_OUT),
  validate(punchSchema, "body"),
  controller.checkOut,
);

router.post(
  "/attendance/break-start",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_CHECK_IN),
  validate(punchSchema, "body"),
  controller.breakStart,
);

router.post(
  "/attendance/break-end",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_CHECK_OUT),
  validate(punchSchema, "body"),
  controller.breakEnd,
);

router.post(
  "/attendance/regularize",
  moduleEnabled(MODULE.HR_ATTENDANCE),
  requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_REGULARIZE),
  validate(regularizeSchema, "body"),
  controller.regularize,
);

// ─── Shifts (28.7 – 28.9) ─────────────────────────────────────────────────────

router.get(
  "/shifts",
  moduleEnabled(MODULE.HR_SHIFTS),
  requirePermission(PERMISSIONS_V2.ESS_SHIFTS_READ),
  validate(shiftsListQuerySchema, "query"),
  controller.listShifts,
);

router.post(
  "/shifts/swap-request",
  moduleEnabled(MODULE.HR_SHIFTS),
  requirePermission(PERMISSIONS_V2.ESS_SHIFTS_SWAP_REQUEST),
  validate(swapRequestSchema, "body"),
  controller.requestSwap,
);

router.post(
  "/shifts/swap-respond/:id",
  moduleEnabled(MODULE.HR_SHIFTS),
  requirePermission(PERMISSIONS_V2.ESS_SHIFTS_SWAP_RESPOND),
  validate(idParamSchema, "params"),
  validate(swapRespondSchema, "body"),
  controller.respondSwap,
);

// ─── Leave (28.10 – 28.13) ────────────────────────────────────────────────────

router.get(
  "/leave/types",
  moduleEnabled(MODULE.HR_LEAVE),
  requirePermission(PERMISSIONS_V2.ESS_LEAVE_TYPES_READ),
  controller.listLeaveTypes,
);

router.get(
  "/leave/balance",
  moduleEnabled(MODULE.HR_LEAVE),
  requirePermission(PERMISSIONS_V2.ESS_LEAVE_BALANCE_READ),
  validate(leaveBalanceQuerySchema, "query"),
  controller.listLeaveBalance,
);

router.get(
  "/leave/requests",
  moduleEnabled(MODULE.HR_LEAVE),
  requirePermission(PERMISSIONS_V2.ESS_LEAVE_REQUEST_READ),
  validate(leaveRequestListQuerySchema, "query"),
  controller.listLeaveRequests,
);

router.post(
  "/leave/requests",
  moduleEnabled(MODULE.HR_LEAVE),
  requirePermission(PERMISSIONS_V2.ESS_LEAVE_REQUEST_CREATE),
  validate(leaveApplySchema, "body"),
  controller.applyLeave,
);

router.post(
  "/leave/requests/:id/cancel",
  moduleEnabled(MODULE.HR_LEAVE),
  requirePermission(PERMISSIONS_V2.ESS_LEAVE_REQUEST_CANCEL),
  validate(idParamSchema, "params"),
  controller.cancelLeave,
);

// ─── Payslips (28.14) ─────────────────────────────────────────────────────────

router.get(
  "/payslips",
  moduleEnabled(MODULE.HR_PAYROLL),
  requirePermission(PERMISSIONS_V2.ESS_PAYSLIPS_READ),
  validate(payslipListQuerySchema, "query"),
  controller.listPayslips,
);

router.get(
  "/payslips/:id",
  moduleEnabled(MODULE.HR_PAYROLL),
  requirePermission(PERMISSIONS_V2.ESS_PAYSLIPS_READ),
  validate(idParamSchema, "params"),
  controller.getPayslip,
);

// Printable HTML payslip (browser → PDF).
router.get(
  "/payslips/:id/pdf",
  moduleEnabled(MODULE.HR_PAYROLL),
  requirePermission(PERMISSIONS_V2.ESS_PAYSLIPS_DOWNLOAD),
  validate(idParamSchema, "params"),
  controller.getPayslipPdf,
);

// ESS document list. Self-scope; confidential
// docs hidden. Per Doc F §28.17.
router.get(
  "/documents",
  moduleEnabled(MODULE.HR),
  requirePermission(PERMISSIONS_V2.ESS_DOCUMENTS_READ),
  validate(documentsListQuerySchema, "query"),
  controller.listDocuments,
);

// ─── Holidays (28.16) ─────────────────────────────────────────────────────────

router.get(
  "/holidays",
  moduleEnabled(MODULE.HR_LEAVE),
  requirePermission(PERMISSIONS_V2.ESS_HOLIDAYS_READ),
  validate(holidaysQuerySchema, "query"),
  controller.listHolidays,
);

export default router;
