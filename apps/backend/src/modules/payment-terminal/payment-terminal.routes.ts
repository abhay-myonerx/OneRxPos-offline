import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";

import * as ctrl from "./payment-terminal.controller";
import { purchaseSchema, refundSchema } from "./payment-terminal.validation";

const router = Router();

// Semi-integrated terminal: send an amount, receive a non-sensitive result.
// No card data ever passes through. Auth only — any till user takes payment.
router.use(authenticate);

router.get("/providers", ctrl.providers);
router.post("/purchase", validate(purchaseSchema), ctrl.purchase);
router.post("/refund", validate(refundSchema), ctrl.refund);
router.get("/last", ctrl.last);

export default router;
