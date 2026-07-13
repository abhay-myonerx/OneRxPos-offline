import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { moduleEnabled } from "../../middleware/moduleEnabled";
import { MODULE } from "../../shared/settings/enabledModules";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./designation.controller";
import {
  createDesignationSchema,
  idParamSchema,
  listQuerySchema,
  updateDesignationSchema,
} from "./designation.validation";

const router = Router();

router.use(authenticate, tenantContext, moduleEnabled(MODULE.HR));

router.get(
  "/",
  requirePermission(PERMISSIONS_V2.HR_DESIGNATIONS_READ),
  validate(listQuerySchema, "query"),
  controller.list,
);

router.post(
  "/",
  requirePermission(PERMISSIONS_V2.HR_DESIGNATIONS_MANAGE),
  validate(createDesignationSchema),
  controller.create,
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_DESIGNATIONS_READ),
  validate(idParamSchema, "params"),
  controller.getById,
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_DESIGNATIONS_MANAGE),
  validate(idParamSchema, "params"),
  validate(updateDesignationSchema),
  controller.update,
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS_V2.HR_DESIGNATIONS_MANAGE),
  validate(idParamSchema, "params"),
  controller.remove,
);

router.patch(
  "/:id/restore",
  requirePermission(PERMISSIONS_V2.HR_DESIGNATIONS_MANAGE),
  validate(idParamSchema, "params"),
  controller.restore,
);

export default router;
