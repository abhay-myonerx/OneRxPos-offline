// First-run setup: creates the very first tenant + super-admin.
// Locked behind SETUP_ACCESS_CODE and refuses to run once any tenant exists.

import { prisma } from "../../config/database";
import { register as authRegister } from "../auth/auth.service";
import { ConflictError } from "../../shared/errors/ConflictError";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import type { CompleteSetupInput } from "./setup.validation";

export async function getStatus() {
  const tenantCount = await prisma.tenant.count();
  return { setupRequired: tenantCount === 0 };
}

export async function complete(input: CompleteSetupInput) {
  // 1. Server must have SETUP_ACCESS_CODE configured (defense in depth).
  //    If it isn't set, refuse the request entirely so an unconfigured
  //    deployment can't be hijacked by the first stranger to find it.
  const expectedCode = process.env.SETUP_ACCESS_CODE;
  if (!expectedCode || expectedCode.trim().length === 0) {
    logger.warn("POST /setup/complete called but SETUP_ACCESS_CODE is not configured");
    throw new ValidationError(
      "Initial setup is locked. The server administrator must set the SETUP_ACCESS_CODE environment variable before the first account can be created.",
    );
  }

  // 2. If any tenant already exists, refuse — setup has already happened.
  const tenantCount = await prisma.tenant.count();
  if (tenantCount > 0) {
    throw new ConflictError("Setup has already been completed. Use the login page instead.");
  }

  // 3. Verify the supplied access code matches the configured one.
  if (input.accessCode !== expectedCode) {
    logger.warn("POST /setup/complete called with wrong access code");
    throw new AuthenticationError("Invalid access code");
  }

  // 4. Reuse the existing register flow to create tenant + admin + store.
  const { accessCode: _ignored, ...registerInput } = input;
  void _ignored;

  const result = await authRegister(registerInput);

  logger.info(
    { tenantId: result.tenant.id, userId: result.user.id },
    "First-run setup completed — initial tenant created",
  );

  return result;
}
