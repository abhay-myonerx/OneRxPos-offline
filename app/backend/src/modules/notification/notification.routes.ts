// In-app real-time notification routes — mounted at /api/v2/notifications.
//
// The inbox endpoints are available to EVERY authenticated user (each user
// only ever sees their own rows — ownership is enforced in the service), so
// they require auth + tenant context but no extra permission. The broadcast
// endpoint is privileged and gated by `notifications.send.manual`.

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { validate } from "../../middleware/validate";
import { requirePermission } from "../../middleware/requirePermission";
import { PERMISSIONS_V2 } from "../../shared/permissions/v2-permissions";

import * as controller from "./notification.controller";
import { broadcastSchema, idParamSchema, listQuerySchema } from "./notification.validation";

const router = Router();

router.use(authenticate, tenantContext);

// ── Own inbox (all roles) ────────────────────────────────────────────────────
router.get("/", validate(listQuerySchema, "query"), controller.list);
router.get("/unread-count", controller.unreadCount);
router.post("/read-all", controller.markAllRead);
router.patch("/:id/read", validate(idParamSchema, "params"), controller.markRead);

// ── Manual broadcast (privileged) ────────────────────────────────────────────
router.post(
  "/broadcast",
  requirePermission(PERMISSIONS_V2.NOTIFICATIONS_SEND_MANUAL),
  validate(broadcastSchema),
  controller.broadcast,
);

export default router;
