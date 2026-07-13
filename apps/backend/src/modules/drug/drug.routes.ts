// Phase 2.1 — Drug catalog routes, mounted at /api/v1/drug-products.
//
// These read the GLOBAL DrugProduct reference catalog, which is NOT tenant-owned
// — so they require `authenticate` (any signed-in user) but NOT `tenantContext`.
// The tenant-scoped, admin-gated product-extension writes (link a DIN / set a
// schedule override) live on the existing product router — see
// `product.routes.ts` (they need `req.db`).

import { Router } from "express";

import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";

import * as ctrl from "./drug.controller";
import { searchDrugProductsSchema, drugDinParamSchema } from "./drug.validation";

const router = Router();

router.use(authenticate);

// GET /api/v1/drug-products?search=&limit=  — search din / brand / ingredient
router.get("/", validate(searchDrugProductsSchema, "query"), ctrl.search);

// GET /api/v1/drug-products/:din            — one catalog entry (404 if unknown)
router.get("/:din", validate(drugDinParamSchema, "params"), ctrl.getByDin);

export default router;
