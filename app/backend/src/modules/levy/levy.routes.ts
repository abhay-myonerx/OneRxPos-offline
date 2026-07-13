// Levy routes (Phase 1.2 Pricing Brain). Follows BACKEND_MODULE_PATTERN.md.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./levy.controller";
import { createLevySchema, idParamSchema, listQuerySchema, updateLevySchema } from "./levy.validation";

const router = Router();

router.use(authenticate, tenantContext);

router.get(
  "/",
  requirePermission(PERMISSIONS_V2.LEVIES_READ),
  validate(listQuerySchema, "query"),
  controller.list,
);

router.post(
  "/",
  requirePermission(PERMISSIONS_V2.LEVIES_MANAGE),
  validate(createLevySchema),
  controller.create,
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS_V2.LEVIES_READ),
  validate(idParamSchema, "params"),
  controller.getById,
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS_V2.LEVIES_MANAGE),
  validate(idParamSchema, "params"),
  validate(updateLevySchema),
  controller.update,
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS_V2.LEVIES_MANAGE),
  validate(idParamSchema, "params"),
  controller.remove,
);

export default router;
