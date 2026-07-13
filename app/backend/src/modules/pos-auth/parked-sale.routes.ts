import { Router } from "express";

import { authenticate } from "@/middleware/authenticate";
import { tenantContext } from "@/middleware/tenantContext";
import { validate } from "@/middleware/validate";

import * as ctrl from "./parked-sale.controller";
import {
  createParkedSaleSchema,
  listParkedSalesSchema,
  parkedSaleIdSchema,
} from "./parked-sale.validation";

const router = Router();

// Parked sales are TENANT-SCOPED (unlike the override sub-router): every
// handler needs the request-scoped `TenantPrismaClient` on `req.db`, so this
// applies `authenticate` + `tenantContext` up front (like `sale.routes.ts`).
router.use(authenticate, tenantContext);

// ─────────────────────────────────────────────────────────────────────────────
// POST   /api/v2/pos/parked-sales           — mirror/create (idempotent)
// GET    /api/v2/pos/parked-sales?storeId=  — list PARKED holds for the store
// POST   /api/v2/pos/parked-sales/:id/claim — atomic PARKED→CLAIMED
// DELETE /api/v2/pos/parked-sales/:id        — discard (idempotent)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/parked-sales", validate(createParkedSaleSchema), ctrl.create);

router.get("/parked-sales", validate(listParkedSalesSchema, "query"), ctrl.list);

router.post("/parked-sales/:id/claim", validate(parkedSaleIdSchema, "params"), ctrl.claim);

router.delete("/parked-sales/:id", validate(parkedSaleIdSchema, "params"), ctrl.discard);

export default router;
