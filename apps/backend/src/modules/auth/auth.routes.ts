import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { authRateLimiter } from "../../middleware/authRateLimiter";
import { registerSchema, loginSchema, cloudLoginSchema, changePasswordSchema } from "./auth.validation";
import { blockRegistrationWhenTenantExists } from "./registration-guard";
import * as controller from "./auth.controller";

const router = Router();

// ── Public routes ─────────────────────────────────────────────────
// Credential endpoints get strict per-IP rate limiting to block credential-stuffing.

// /register is open ONLY before any tenant exists. After first-run setup,
// new users must be invited through the Users module instead.
router.post(
  "/register",
  authRateLimiter,
  blockRegistrationWhenTenantExists,
  validate(registerSchema),
  controller.register,
);

router.post("/login", authRateLimiter, validate(loginSchema), controller.login);

router.post("/cloud-login", authRateLimiter, validate(cloudLoginSchema),controller.cloudLogin);

// Refresh also gets strict limiting — prevents refresh-token bruteforce.
router.post("/refresh", authRateLimiter, controller.refresh);

// ── Protected routes ────────────────────────────────────────────────

router.get("/me", authenticate, controller.me);

router.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword,
);

router.post("/logout", controller.logout);

export default router;
