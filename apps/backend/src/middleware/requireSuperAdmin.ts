import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { AuthorizationError } from "@/shared/errors";

const PLATFORM_TENANT_SLUG = "__platform__";

let cachedPlatformTenantId: string | null = null;

async function getPlatformTenantId(): Promise<string | null> {
  if (cachedPlatformTenantId) return cachedPlatformTenantId;

  const t = await prisma.tenant.findFirst({
    where: { slug: PLATFORM_TENANT_SLUG },
    select: { id: true },
  });

  if (t) cachedPlatformTenantId = t.id;
  return cachedPlatformTenantId;
}

export async function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthorizationError("Authentication required");
    }

    if (req.user.role !== "SUPER_ADMIN") {
      throw new AuthorizationError("This endpoint requires SUPER_ADMIN role");
    }

    const platformId = await getPlatformTenantId();
    if (!platformId) {
      throw new AuthorizationError(
        "Platform tenant is not configured. Contact the system administrator.",
      );
    }

    if (req.user.tenantId !== platformId) {
      throw new AuthorizationError(
        "SUPER_ADMIN role is only valid for users in the platform tenant",
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
