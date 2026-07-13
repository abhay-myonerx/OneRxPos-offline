import { Router } from "express";
import { validate } from "../../middleware/validate";
import { authRateLimiter } from "../../middleware/authRateLimiter";
import { completeSetupSchema } from "./setup.validation";
import * as controller from "./setup.controller";

const router = Router();

// Both endpoints are PUBLIC by design — they're how an empty deployment
// gets bootstrapped. Real protection comes from:
//   1. The "tenant count > 0" check inside setup.service.complete
//   2. SETUP_ACCESS_CODE that the server administrator must configure
//   3. Per-IP rate limiting on the credential-style endpoints below

router.get("/status", controller.status);

router.post("/complete", authRateLimiter, validate(completeSetupSchema), controller.complete);

export default router;
