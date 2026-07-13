// Catalog import (3H.3) — mounted at /api/v1/import.

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { tenantContext } from "../../middleware/tenantContext";
import { authorize } from "../../middleware/authorize";
import * as ctrl from "./import.controller";

const router = Router();

router.use(authenticate, tenantContext);

// POST /api/v1/import/catalog — { mode, rows, options, dryRun }.
router.post("/catalog", authorize("product:write"), ctrl.importCatalog);

export default router;
