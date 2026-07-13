import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./receipt.controller";

const router = Router();

router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/v1/receipts/template           — get receipt template config
// PUT    /api/v1/receipts/template           — create/update receipt template
// GET    /api/v1/receipts/sale/:saleId       — generate receipt for a sale
// GET    /api/v1/receipts/sale/:saleId/preview — HTML preview of receipt
// ─────────────────────────────────────────────────────────────────────────────

router.get("/template", authorize(PERMISSIONS.RECEIPT_READ), ctrl.getTemplate);

router.put("/template", authorize(PERMISSIONS.RECEIPT_WRITE), ctrl.upsertTemplate);

router.get("/sale/:saleId", authorize(PERMISSIONS.RECEIPT_GENERATE), ctrl.generateReceipt);

router.get("/sale/:saleId/preview", authorize(PERMISSIONS.RECEIPT_GENERATE), ctrl.previewReceipt);

// POST /api/v1/receipts/sale/:saleId/print — print the sale receipt to the
// store's network printer (auto-print at checkout).
router.post("/sale/:saleId/print", authorize(PERMISSIONS.RECEIPT_GENERATE), ctrl.printReceipt);

// POST /api/v1/receipts/sale/:saleId/email — email the sale receipt (3H.1).
router.post("/sale/:saleId/email", authorize(PERMISSIONS.RECEIPT_GENERATE), ctrl.emailReceipt);

export default router;
