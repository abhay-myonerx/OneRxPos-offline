// Outbound messaging routes — mounted at /api/v2/messaging.
//
// `test` is the send-a-test-email action (MESSAGING_SEND); the audit log + resend
// are management actions (MESSAGING_MANAGE). All require auth + tenant context.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./messaging.controller";
import { testSendSchema, logListSchema, idParamSchema } from "./messaging.validation";

const router = Router();

router.use(authenticate, tenantContext);

router.post(
  "/test",
  requirePermission(PERMISSIONS_V2.MESSAGING_SEND),
  validate(testSendSchema),
  controller.sendTest,
);

router.get(
  "/log",
  requirePermission(PERMISSIONS_V2.MESSAGING_MANAGE),
  validate(logListSchema, "query"),
  controller.listLog,
);

router.post(
  "/log/:id/resend",
  requirePermission(PERMISSIONS_V2.MESSAGING_MANAGE),
  validate(idParamSchema, "params"),
  controller.resend,
);

export default router;
