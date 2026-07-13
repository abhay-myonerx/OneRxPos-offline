// HRM Shifts routes. Per
// docs/v2/hrm-deep-dives/3.hrm-shifts.md §7 + API Reference §25.
//
// Mounted at `/api/v2/hr/shifts` in `src/app.ts`. Every route runs the
// existing chain: authenticate → tenantContext → requirePermission /
// requireAnyPermission → validate.
//
// HARD RULE: this module does NOT touch the existing `/api/v1/cashier-*`
// routes — `CashierShift` is a cash-drawer concept and is orthogonal
// (deep-dive §4).

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./shift.controller";
import {
  idParamSchema,
  scheduleBulkCreateSchema,
  scheduleListQuerySchema,
  scheduleUpdateSchema,
  swapApproveSchema,
  swapListQuerySchema,
  swapRequestCreateSchema,
  swapRespondSchema,
  workShiftCreateSchema,
  workShiftListQuerySchema,
  workShiftUpdateSchema,
} from "./shift.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR_SHIFTS));

// ─── WorkShift templates ───────────────────────────────────────────────────────

router.get(
  "/templates",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_READ,
    PERMISSIONS_V2.HR_SHIFTS_TEMPLATE_MANAGE,
    PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_READ,
    PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_CREATE,
    PERMISSIONS_V2.ESS_SHIFTS_READ,
  ),
  validate(workShiftListQuerySchema, "query"),
  controller.listTemplates,
);

router.get(
  "/templates/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_READ,
    PERMISSIONS_V2.HR_SHIFTS_TEMPLATE_MANAGE,
    PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_READ,
    PERMISSIONS_V2.ESS_SHIFTS_READ,
  ),
  validate(idParamSchema, "params"),
  controller.getTemplate,
);

router.post(
  "/templates",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_TEMPLATE_MANAGE),
  validate(workShiftCreateSchema),
  controller.createTemplate,
);

router.patch(
  "/templates/:id",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_TEMPLATE_MANAGE),
  validate(idParamSchema, "params"),
  validate(workShiftUpdateSchema),
  controller.updateTemplate,
);

router.delete(
  "/templates/:id",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_TEMPLATE_MANAGE),
  validate(idParamSchema, "params"),
  controller.deactivateTemplate,
);

router.post(
  "/templates/:id/restore",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_TEMPLATE_MANAGE),
  validate(idParamSchema, "params"),
  controller.reactivateTemplate,
);

// ─── ShiftSchedule (roster) ────────────────────────────────────────────────────

router.get(
  "/schedule",
  requireAnyPermission(PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_READ, PERMISSIONS_V2.ESS_SHIFTS_READ),
  validate(scheduleListQuerySchema, "query"),
  controller.listSchedules,
);

router.post(
  "/schedule",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_CREATE),
  validate(scheduleBulkCreateSchema),
  controller.createBulkSchedule,
);

router.patch(
  "/schedule/:id",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_UPDATE),
  validate(idParamSchema, "params"),
  validate(scheduleUpdateSchema),
  controller.updateSchedule,
);

router.delete(
  "/schedule/:id",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_SCHEDULE_DELETE),
  validate(idParamSchema, "params"),
  controller.cancelSchedule,
);

// ─── Swap workflow ─────────────────────────────────────────────────────────────
// `request.own` and `respond` are also granted to EMPLOYEE via the ESS
// bundle (ESS_SHIFTS_SWAP_REQUEST / ESS_SHIFTS_SWAP_RESPOND), so the
// HR path is accessible to anyone who can manage their own shifts.

router.get(
  "/swap-requests",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_SWAP_REQUEST_OWN,
    PERMISSIONS_V2.HR_SHIFTS_SWAP_RESPOND,
    PERMISSIONS_V2.HR_SHIFTS_SWAP_APPROVE,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_REQUEST,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_RESPOND,
  ),
  validate(swapListQuerySchema, "query"),
  controller.listSwaps,
);

router.get(
  "/swap-requests/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_SWAP_REQUEST_OWN,
    PERMISSIONS_V2.HR_SHIFTS_SWAP_RESPOND,
    PERMISSIONS_V2.HR_SHIFTS_SWAP_APPROVE,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_REQUEST,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_RESPOND,
  ),
  validate(idParamSchema, "params"),
  controller.getSwap,
);

router.post(
  "/swap-requests",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_SWAP_REQUEST_OWN,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_REQUEST,
  ),
  validate(swapRequestCreateSchema),
  controller.requestSwap,
);

router.post(
  "/swap-requests/:id/respond",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_SWAP_RESPOND,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_RESPOND,
  ),
  validate(idParamSchema, "params"),
  validate(swapRespondSchema),
  controller.respondPeer,
);

router.post(
  "/swap-requests/:id/approve",
  requirePermission(PERMISSIONS_V2.HR_SHIFTS_SWAP_APPROVE),
  validate(idParamSchema, "params"),
  validate(swapApproveSchema),
  controller.approveManager,
);

router.post(
  "/swap-requests/:id/cancel",
  requireAnyPermission(
    PERMISSIONS_V2.HR_SHIFTS_SWAP_REQUEST_OWN,
    PERMISSIONS_V2.ESS_SHIFTS_SWAP_REQUEST,
  ),
  validate(idParamSchema, "params"),
  controller.cancelSwap,
);

export default router;
