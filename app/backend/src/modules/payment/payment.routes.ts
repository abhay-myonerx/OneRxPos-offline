import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import { PERMISSIONS } from "../../shared/types/enums";
import * as ctrl from "./payment.controller";

const router = Router();

router.use(authenticate, tenantContext);

// GET    /api/v1/payments                         — list all payments
router.get("/", authorize(PERMISSIONS.SALE_READ), ctrl.list);

// GET    /api/v1/payments/:id                     — get payment detail
router.get("/:id", authorize(PERMISSIONS.SALE_READ), ctrl.getById);

// POST   /api/v1/payments/collect-due             — collect due from customer
router.post("/collect-due", authorize(PERMISSIONS.SALE_CREATE), ctrl.collectDue);

// GET    /api/v1/payments/customer/:customerId    — customer payment history
router.get("/customer/:customerId", authorize(PERMISSIONS.CUSTOMER_READ), ctrl.customerPayments);

export default router;
