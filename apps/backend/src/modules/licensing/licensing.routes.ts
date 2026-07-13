import { Router } from "express";
import * as ctrl from "./licensing.controller";

const router = Router();

// POST /api/v2/license/activate — bind key<->device, return signed lease
// POST /api/v2/license/validate — re-check binding, return fresh lease
// GET  /api/v2/license/status   — this till's persisted license state
router.post("/activate", ctrl.activateController);
router.post("/validate", ctrl.validateController);
router.get("/status", ctrl.statusController);

export default router;
