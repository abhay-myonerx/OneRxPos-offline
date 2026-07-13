// Catalog Brand routes. Follows BACKEND_MODULE_PATTERN.md.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./brand.controller";
import {
  createBrandSchema,
  idParamSchema,
  listQuerySchema,
  updateBrandSchema,
} from "./brand.validation";

const router = Router();

router.use(authenticate, tenantContext);

router.get(
  "/",
  requirePermission(PERMISSIONS_V2.BRANDS_READ),
  validate(listQuerySchema, "query"),
  controller.list,
);

router.post(
  "/",
  requirePermission(PERMISSIONS_V2.BRANDS_MANAGE),
  validate(createBrandSchema),
  controller.create,
);

router.get(
  "/:id",
  requirePermission(PERMISSIONS_V2.BRANDS_READ),
  validate(idParamSchema, "params"),
  controller.getById,
);

router.patch(
  "/:id",
  requirePermission(PERMISSIONS_V2.BRANDS_MANAGE),
  validate(idParamSchema, "params"),
  validate(updateBrandSchema),
  controller.update,
);

router.delete(
  "/:id",
  requirePermission(PERMISSIONS_V2.BRANDS_MANAGE),
  validate(idParamSchema, "params"),
  controller.remove,
);

router.patch(
  "/:id/restore",
  requirePermission(PERMISSIONS_V2.BRANDS_MANAGE),
  validate(idParamSchema, "params"),
  controller.restore,
);

export default router;
