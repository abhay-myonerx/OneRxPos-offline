import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { PERMISSIONS } from "../../shared/types/enums";

import * as ctrl from "./device-profile.controller";
import {
  createDeviceProfileSchema,
  updateDeviceProfileSchema,
  deviceProfileIdSchema,
} from "./device-profile.validation";

const router = Router();

// Device profiles are TENANT-SCOPED — every handler needs req.db. Reads are
// till-open (the POS/panel lists devices); writes are admin-gated
// (SETTINGS_MANAGE), like barcode-template.routes.
router.use(authenticate, tenantContext);

router.get("/", ctrl.list);

router.post(
  "/",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(createDeviceProfileSchema),
  ctrl.create,
);

router.put(
  "/:id",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(deviceProfileIdSchema, "params"),
  validate(updateDeviceProfileSchema),
  ctrl.update,
);

router.delete(
  "/:id",
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate(deviceProfileIdSchema, "params"),
  ctrl.remove,
);

export default router;
