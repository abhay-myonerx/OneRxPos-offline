// HRM Leave routes.
// Per docs/v2/hrm-deep-dives/4.hrm-leave.md §6 + API Reference §26.
//
// Mounted at `/api/v2/hr/leave` in `src/app.ts`.
// Auth chain: authenticate → tenantContext → requirePermission/Any → validate.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./leave.controller";
import {
  adjustBalanceSchema,
  idParamSchema,
  leaveBalanceListQuerySchema,
  leaveDecisionSchema,
  leavePolicyCreateSchema,
  leavePolicyListQuerySchema,
  leavePolicyUpdateSchema,
  leaveRequestCreateSchema,
  leaveRequestListQuerySchema,
  leaveRequestUpdateSchema,
  leaveTypeCreateSchema,
  leaveTypeListQuerySchema,
  leaveTypeUpdateSchema,
} from "./leave.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR_LEAVE));

// ─── Leave Types ───────────────────────────────────────────────────────────────

router.get(
  "/types",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_TYPES_READ,
    PERMISSIONS_V2.HR_LEAVE_TYPES_MANAGE,
    PERMISSIONS_V2.ESS_LEAVE_TYPES_READ,
  ),
  validate(leaveTypeListQuerySchema, "query"),
  controller.listLeaveTypes,
);

router.get(
  "/types/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_TYPES_READ,
    PERMISSIONS_V2.HR_LEAVE_TYPES_MANAGE,
    PERMISSIONS_V2.ESS_LEAVE_TYPES_READ,
  ),
  validate(idParamSchema, "params"),
  controller.getLeaveType,
);

router.post(
  "/types",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_TYPES_MANAGE),
  validate(leaveTypeCreateSchema),
  controller.createLeaveType,
);

router.patch(
  "/types/:id",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_TYPES_MANAGE),
  validate(idParamSchema, "params"),
  validate(leaveTypeUpdateSchema),
  controller.updateLeaveType,
);

router.delete(
  "/types/:id",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_TYPES_MANAGE),
  validate(idParamSchema, "params"),
  controller.deactivateLeaveType,
);

router.post(
  "/types/:id/restore",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_TYPES_MANAGE),
  validate(idParamSchema, "params"),
  controller.reactivateLeaveType,
);

// ─── Leave Policies ────────────────────────────────────────────────────────────

router.get(
  "/policies",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_POLICIES_READ,
    PERMISSIONS_V2.HR_LEAVE_POLICIES_MANAGE,
  ),
  validate(leavePolicyListQuerySchema, "query"),
  controller.listPolicies,
);

router.post(
  "/policies",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_POLICIES_MANAGE),
  validate(leavePolicyCreateSchema),
  controller.createPolicy,
);

router.patch(
  "/policies/:id",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_POLICIES_MANAGE),
  validate(idParamSchema, "params"),
  validate(leavePolicyUpdateSchema),
  controller.updatePolicy,
);

// ─── Leave Balances ────────────────────────────────────────────────────────────

router.get(
  "/balances",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_BALANCES_READ_ALL,
    PERMISSIONS_V2.HR_LEAVE_BALANCES_READ_TEAM,
    PERMISSIONS_V2.ESS_LEAVE_BALANCE_READ,
  ),
  validate(leaveBalanceListQuerySchema, "query"),
  controller.listBalances,
);

router.post(
  "/balances/adjust",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_BALANCES_ADJUST),
  validate(adjustBalanceSchema),
  controller.adjustBalance,
);

// ─── Leave Requests ────────────────────────────────────────────────────────────

router.get(
  "/requests",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_REQUEST_READ_ALL,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_READ_TEAM,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_READ_OWN,
    PERMISSIONS_V2.ESS_LEAVE_REQUEST_READ,
  ),
  validate(leaveRequestListQuerySchema, "query"),
  controller.listRequests,
);

router.get(
  "/requests/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_REQUEST_READ_ALL,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_READ_TEAM,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_READ_OWN,
    PERMISSIONS_V2.ESS_LEAVE_REQUEST_READ,
  ),
  validate(idParamSchema, "params"),
  controller.getRequest,
);

router.post(
  "/requests",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_REQUEST_CREATE_FOR,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_CREATE_OWN,
    PERMISSIONS_V2.ESS_LEAVE_REQUEST_CREATE,
  ),
  validate(leaveRequestCreateSchema),
  controller.createRequest,
);

router.patch(
  "/requests/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_REQUEST_CREATE_FOR,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_CREATE_OWN,
    PERMISSIONS_V2.ESS_LEAVE_REQUEST_CREATE,
  ),
  validate(idParamSchema, "params"),
  validate(leaveRequestUpdateSchema),
  controller.updateRequest,
);

router.post(
  "/requests/:id/approve",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_REQUEST_APPROVE),
  validate(idParamSchema, "params"),
  validate(leaveDecisionSchema),
  controller.approveRequest,
);

router.post(
  "/requests/:id/reject",
  requirePermission(PERMISSIONS_V2.HR_LEAVE_REQUEST_REJECT),
  validate(idParamSchema, "params"),
  validate(leaveDecisionSchema),
  controller.rejectRequest,
);

router.post(
  "/requests/:id/cancel",
  requireAnyPermission(
    PERMISSIONS_V2.HR_LEAVE_REQUEST_CANCEL_OWN,
    PERMISSIONS_V2.HR_LEAVE_REQUEST_CREATE_FOR,
    PERMISSIONS_V2.ESS_LEAVE_REQUEST_CANCEL,
  ),
  validate(idParamSchema, "params"),
  controller.cancelRequest,
);

export default router;
