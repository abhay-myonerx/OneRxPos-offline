// HRM Holiday routes.
// Per docs/v2/hrm-deep-dives/4.hrm-leave.md §11 + API Reference §26.
//
// Mounted at `/api/v2/hr/holidays` in `src/app.ts`.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requireAnyPermission, requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./holiday.controller";
import {
  holidayCalendarQuerySchema,
  holidayCreateSchema,
  holidayListQuerySchema,
  holidayPresetImportSchema,
  holidayUpdateSchema,
  idParamSchema,
} from "./holiday.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR_LEAVE));

// Calendar view (specific, before /:id to avoid route shadowing).
router.get(
  "/calendar",
  requireAnyPermission(
    PERMISSIONS_V2.HR_HOLIDAYS_READ,
    PERMISSIONS_V2.HR_HOLIDAYS_MANAGE,
    PERMISSIONS_V2.ESS_HOLIDAYS_READ,
  ),
  validate(holidayCalendarQuerySchema, "query"),
  controller.getCalendar,
);

// Preset import.
router.post(
  "/import-preset",
  requirePermission(PERMISSIONS_V2.HR_HOLIDAYS_MANAGE),
  validate(holidayPresetImportSchema),
  controller.importPreset,
);

// CRUD.
router.get(
  "/",
  requireAnyPermission(
    PERMISSIONS_V2.HR_HOLIDAYS_READ,
    PERMISSIONS_V2.HR_HOLIDAYS_MANAGE,
    PERMISSIONS_V2.ESS_HOLIDAYS_READ,
  ),
  validate(holidayListQuerySchema, "query"),
  controller.listHolidays,
);

router.post(
  "/",
  requirePermission(PERMISSIONS_V2.HR_HOLIDAYS_MANAGE),
  validate(holidayCreateSchema),
  controller.createHoliday,
);

router.get(
  "/:id",
  requireAnyPermission(
    PERMISSIONS_V2.HR_HOLIDAYS_READ,
    PERMISSIONS_V2.HR_HOLIDAYS_MANAGE,
    PERMISSIONS_V2.ESS_HOLIDAYS_READ,
  ),
  validate(idParamSchema, "params"),
  controller.getHoliday,
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_HOLIDAYS_MANAGE),
  validate(idParamSchema, "params"),
  validate(holidayUpdateSchema),
  controller.updateHoliday,
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_HOLIDAYS_MANAGE),
  validate(idParamSchema, "params"),
  controller.deactivateHoliday,
);

export default router;
