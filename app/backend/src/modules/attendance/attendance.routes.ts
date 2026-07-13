// HRM Attendance routes. Per
// docs/v2/hrm-deep-dives/2.hrm-attendance.md §7.
//
// Punch endpoints accept EITHER self-service OR manual-for-other in the
// same handler. The route requires one of two permissions; the service
// inspects whether `employeeId` is provided and forces `method = MANUAL`
// when acting on another employee.
//
// The biometric webhook (§11) is intentionally NOT mounted in this MVP —
// see OPEN_ITEMS OI-028.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./attendance.controller";
import {
  correctionCreateSchema,
  correctionDecisionSchema,
  correctionListQuerySchema,
  idParamSchema,
  listQuerySchema,
  punchSchema,
  summaryQuerySchema,
} from "./attendance.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR_ATTENDANCE));

// ── Punch endpoints (self + manual) ─────────────────────────────────────────
const punchPerms = [
  PERMISSIONS_V2.ESS_ATTENDANCE_CHECK_IN,
  PERMISSIONS_V2.HR_ATTENDANCE_CHECK_IN_MANUAL,
] as const;

router.post(
  "/check-in",
  requireAnyPermission(...punchPerms),
  validate(punchSchema),
  controller.checkIn,
);

router.post(
  "/check-out",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_CHECK_OUT,
    PERMISSIONS_V2.HR_ATTENDANCE_CHECK_OUT_MANUAL,
  ),
  validate(punchSchema),
  controller.checkOut,
);

router.post(
  "/break-start",
  requireAnyPermission(...punchPerms),
  validate(punchSchema),
  controller.breakStart,
);

router.post(
  "/break-end",
  requireAnyPermission(...punchPerms),
  validate(punchSchema),
  controller.breakEnd,
);

// ── Reads ───────────────────────────────────────────────────────────────────

router.get("/today", requirePermission(PERMISSIONS_V2.ESS_ATTENDANCE_READ), controller.today);

router.get(
  "/summary",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_READ,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_OWN,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_TEAM,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_ALL,
  ),
  validate(summaryQuerySchema, "query"),
  controller.summary,
);

router.get(
  "/",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_READ,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_OWN,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_TEAM,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_ALL,
  ),
  validate(listQuerySchema, "query"),
  controller.list,
);

// ── Corrections ────────────────────────────────────────────────────────────
// More-specific routes BEFORE `/:id` so the param route doesn't capture them.

router.get(
  "/corrections",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_REGULARIZE,
    PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_REQUEST,
    PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_APPROVE,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_ALL,
  ),
  validate(correctionListQuerySchema, "query"),
  controller.correctionsList,
);

router.post(
  "/corrections",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_REGULARIZE,
    PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_REQUEST,
  ),
  validate(correctionCreateSchema),
  controller.correctionsRequest,
);

router.get(
  "/corrections/:id",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_REGULARIZE,
    PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_REQUEST,
    PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_APPROVE,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_ALL,
  ),
  validate(idParamSchema, "params"),
  controller.correctionsGetById,
);

router.post(
  "/corrections/:id/approve",
  requirePermission(PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_APPROVE),
  validate(idParamSchema, "params"),
  validate(correctionDecisionSchema),
  controller.correctionsApprove,
);

router.post(
  "/corrections/:id/reject",
  requirePermission(PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_REJECT),
  validate(idParamSchema, "params"),
  validate(correctionDecisionSchema),
  controller.correctionsReject,
);

router.post(
  "/corrections/:id/cancel",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_REGULARIZE,
    PERMISSIONS_V2.HR_ATTENDANCE_REGULARIZE_REQUEST,
  ),
  validate(idParamSchema, "params"),
  controller.correctionsCancel,
);

// ── Generic record detail (last; tightest authorization in the service) ────

router.get(
  "/:id",
  requireAnyPermission(
    PERMISSIONS_V2.ESS_ATTENDANCE_READ,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_OWN,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_TEAM,
    PERMISSIONS_V2.HR_ATTENDANCE_READ_ALL,
  ),
  validate(idParamSchema, "params"),
  controller.getById,
);

export default router;
