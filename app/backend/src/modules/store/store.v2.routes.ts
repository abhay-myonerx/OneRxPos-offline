// v2-only store endpoints. Mounted at
// `/api/v2/stores` alongside the existing v1 mount; the v1 router
// stays untouched. Per API Reference §7.8–7.9.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./store.controller";
import { updateStoreGeolocationSchema, updateStoreIpWhitelistSchema } from "./store.validation";

const router = Router();

router.use(authenticate, tenantContext);

router.patch(
  "/:id/geolocation",
  requirePermission(PERMISSIONS_V2.STORES_GEOLOCATION_UPDATE),
  validate(updateStoreGeolocationSchema),
  controller.updateGeolocation,
);

router.patch(
  "/:id/ip-whitelist",
  requirePermission(PERMISSIONS_V2.STORES_IP_WHITELIST_UPDATE),
  validate(updateStoreIpWhitelistSchema),
  controller.updateIpWhitelist,
);

export default router;
