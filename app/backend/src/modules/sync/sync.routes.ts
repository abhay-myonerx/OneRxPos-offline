import { Router } from "express";
import { syncAuth } from "./sync-auth.middleware";
import * as ctrl from "./sync.controller";

const router = Router();

router.use(syncAuth);

// ─────────────────────────────────────────────────────────────────────────────
// POST   /api/v2/sync/push     — store-node pushes queued outbox events
// GET    /api/v2/sync/status   — cheap liveness/clock-sync check
// ─────────────────────────────────────────────────────────────────────────────

router.post("/push", ctrl.pushController);

router.get("/status", ctrl.statusController);

export default router;
