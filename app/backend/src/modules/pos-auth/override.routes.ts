import { Router } from "express";

import { authenticate } from "@/middleware/authenticate";
import { validate } from "@/middleware/validate";

import * as ctrl from "./override.controller";
import { consumeOverrideSchema } from "./override.validation";

const router = Router();

// POST /api/v2/pos/override — inline-PIN manager override grant. Only
// `authenticate` in front (no `tenantContext`/`authorize`): any
// authenticated (cashier) session may REQUEST an override, since the
// permission being checked belongs to the AUTHORIZER named in the body,
// not the caller. See `override.controller.ts` for the full rationale.
router.post("/override", authenticate, ctrl.requestOverrideController);

// POST /api/v2/pos/override/consume — verify+consume+audit a grant for a
// PRE-checkout gated action (void line, clear transaction). Also only
// `authenticate` in front — see `consumeOverrideController`.
router.post("/override/consume", authenticate, validate(consumeOverrideSchema), ctrl.consumeOverrideController);

export default router;
