import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/types/enums";
import * as controller from "./audit.controller";

const router = Router();

router.use(authenticate);

// GET /api/v1/audit
// ADMIN/MANAGER can see their own tenant's audit logs (tenant-scoped via db)
router.get("/", tenantContext, authorize(PERMISSIONS.REPORT_READ), controller.listAuditLogs);

// GET /api/v1/audit/all
// SUPER_ADMIN only — platform-wide audit logs, optionally filtered by tenantId
router.get("/all", authorize("*" as never), controller.listAllAuditLogs);

export default router;
