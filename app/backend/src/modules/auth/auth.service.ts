import { prisma } from "../../config/database";
import { hashPassword, verifyPassword } from "../../shared/utils/password";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from "../../shared/utils/jwt";
import { AuthenticationError } from "../../shared/errors/AuthenticationError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { config } from "../../config";
import { logger } from "../../shared/utils/logger";
import type { RegisterInput, LoginInput, ChangePasswordInput } from "./auth.validation";
import { resolveUserPermissionsArray } from "../../shared/permissions/resolver";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Convert "7d" → ms for refresh token DB expiry */
function parseExpiryToMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // fallback 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? multipliers.d);
}

/** Generate a URL-safe slug from a business name */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Build a TokenPayload from a user + their accessible storeIds */
function buildTokenPayload(
  user: {
    id: string;
    tenantId: string;
    storeId: string | null;
    role: string;
    email: string;
    firstName: string;
    lastName: string;
  },
  storeIds: string[],
): TokenPayload {
  return {
    sub: user.id,
    tenantId: user.tenantId,
    storeId: user.storeId,
    storeIds,
    role: user.role,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/** Issue access + refresh token pair, persist refresh in DB */
async function issueTokens(
  userId: string,
  payload: TokenPayload,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken({ sub: payload.sub });

  const expiresAt = new Date(Date.now() + parseExpiryToMs(config.JWT_REFRESH_EXPIRY));

  await prisma.refreshToken.create({
    data: { userId, token: refreshToken, expiresAt },
  });

  return { accessToken, refreshToken };
}

/** Get all storeIds a user can access (ADMIN/SUPER_ADMIN → all stores in tenant) */
async function getUserStoreIds(
  tenantId: string,
  storeId: string | null,
  role: string,
): Promise<string[]> {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    const stores = await prisma.store.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    return stores.map((s) => s.id);
  }
  return storeId ? [storeId] : [];
}

/**
 * Issue a standard access/refresh token pair for an already-authenticated
 * user, given an explicit tenantId/storeId — used by PIN quick-login
 * (Phase 1.1 Task 8), which resolves those from the enrolled device rather
 * than from a request session. Mirrors exactly what `login()` builds
 * (same payload shape, same `getUserStoreIds` + `issueTokens`), so a
 * PIN-login session is indistinguishable from a password-login session to
 * the rest of the app.
 */
export async function issueTokensForUser(
  userId: string,
  tenantId: string,
  storeId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: { select: { status: true } },
    },
  });
  if (!user) {
    throw new AuthenticationError("Invalid credentials");
  }

  // Authoritative gate — this export is shared by every non-password login
  // path (currently PIN quick-login) and must fail closed even if a caller
  // forgets to re-check tenant/user status itself. Mirrors login()'s exact
  // checks/messages so a suspended/cancelled tenant or deactivated user can
  // never mint working tokens through a side door.
  if (user.tenant.status === "SUSPENDED") {
    throw new AuthenticationError("Your account has been suspended. Please contact support.");
  }
  if (user.tenant.status === "CANCELLED") {
    throw new AuthenticationError("Your account has been cancelled.");
  }
  if (!user.isActive) {
    throw new AuthenticationError("Your user account is deactivated");
  }

  const storeIds = await getUserStoreIds(tenantId, storeId, user.role);
  const payload = buildTokenPayload(
    {
      id: user.id,
      tenantId,
      storeId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    storeIds,
  );

  return issueTokens(user.id, payload);
}

// ── Register ────────────────────────────────────────────────────────────────

export async function register(input: RegisterInput) {
  const baseSlug = slugify(input.businessName);
  const suffix = Math.random().toString(36).slice(2, 6);
  const slug = `${baseSlug}-${suffix}`;

  const existingUser = await prisma.user.findFirst({
    where: { email: input.email },
  });
  if (existingUser) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.businessName,
        slug,
        email: input.businessEmail,
        phone: input.businessPhone,
        plan: "FREE",
        status: "TRIAL",
        settings: {},
      },
    });

    const store = await tx.store.create({
      data: {
        tenantId: tenant.id,
        name: "Main Store",
        code: "MAIN",
        settings: {},
      },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: "ADMIN",
        isActive: true,
        lastLoginAt: new Date(),
      },
    });

    const sequenceTypes = [
      { type: "sale", prefix: "INV-" },
      { type: "purchase", prefix: "PO-" },
      { type: "quotation", prefix: "QT-" },
      { type: "transfer", prefix: "TR-" },
    ];

    for (const seq of sequenceTypes) {
      await tx.invoiceSequence.create({
        data: {
          tenantId: tenant.id,
          type: seq.type,
          prefix: seq.prefix,
          lastNumber: 0,
        },
      });
    }

    return { tenant, store, user };
  });

  const storeIds = [result.store.id];
  const payload = buildTokenPayload(
    {
      id: result.user.id,
      tenantId: result.tenant.id,
      storeId: result.store.id,
      role: result.user.role,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
    },
    storeIds,
  );
  const tokens = await issueTokens(result.user.id, payload);

  logger.info({ tenantId: result.tenant.id, userId: result.user.id }, "New tenant registered");

  const permissions = resolveUserPermissionsArray({
    id: result.user.id,
    role: result.user.role,
    tenantId: result.tenant.id,
  });
  return {
    ...tokens,
    user: {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
      permissions,
    },
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug,
      plan: result.tenant.plan,
    },
  };
}

// ── Login ───────────────────────────────────────────────────────────────────

export async function login(input: LoginInput) {
  const users = await prisma.user.findMany({
    where: { email: input.email },
    include: {
      tenant: { select: { id: true, status: true, slug: true, name: true, plan: true } },
    },
  });

  if (users.length === 0) {
    throw new AuthenticationError("Invalid email or password");
  }

  if (users.length > 1) {
    throw new ValidationError("This email exists in multiple accounts. Please contact support.");
  }

  const user = users[0];

  if (user.tenant.status === "SUSPENDED") {
    throw new AuthenticationError("Your account has been suspended. Please contact support.");
  }
  if (user.tenant.status === "CANCELLED") {
    throw new AuthenticationError("Your account has been cancelled.");
  }

  if (!user.isActive) {
    throw new AuthenticationError("Your user account is deactivated");
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw new AuthenticationError("Invalid email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const storeIds = await getUserStoreIds(user.tenantId, user.storeId, user.role);
  const payload = buildTokenPayload(
    {
      id: user.id,
      tenantId: user.tenantId,
      storeId: user.storeId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    storeIds,
  );
  const tokens = await issueTokens(user.id, payload);

  logger.info({ userId: user.id, tenantId: user.tenantId }, "User logged in");

  const permissions = resolveUserPermissionsArray({
    id: user.id,
    role: user.role,
    tenantId: user.tenantId,
  });
  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      storeId: user.storeId,
      permissions,
    },
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      plan: user.tenant.plan,
    },
  };
}

export async function refresh(refreshTokenValue: string) {
  // 1. Verify JWT signature first — if this fails, the token is outright invalid
  let decoded: { sub: string };
  try {
    decoded = verifyRefreshToken(refreshTokenValue);
  } catch {
    throw new AuthenticationError("Invalid refresh token");
  }

  // 2. Look up in DB
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
  });

  // 3. THEFT DETECTION — token is valid JWT but not in DB
  //    => it was already used once and rotated out, OR it was revoked.
  //    Either way: this is suspicious. Revoke ALL tokens for this user.

  if (!storedToken) {
    await prisma.refreshToken.deleteMany({
      where: { userId: decoded.sub },
    });
    logger.warn(
      { userId: decoded.sub },
      "Refresh token reuse detected — all tokens revoked for user",
    );
    throw new AuthenticationError("Refresh token has been revoked. Please log in again.");
  }

  // 4. Expiry check
  if (storedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    throw new AuthenticationError("Refresh token has expired");
  }

  // 5. Rotation — delete the used token before issuing a new one
  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

  // 6. Fetch user for new token payload
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: {
      tenant: { select: { id: true, status: true, slug: true, name: true, plan: true } },
    },
  });

  if (!user || !user.isActive) {
    throw new AuthenticationError("User account is no longer active");
  }

  if (user.tenant.status === "SUSPENDED" || user.tenant.status === "CANCELLED") {
    throw new AuthenticationError("Tenant account is no longer active");
  }

  // 7. Issue new pair
  const storeIds = await getUserStoreIds(user.tenantId, user.storeId, user.role);
  const payload = buildTokenPayload(
    {
      id: user.id,
      tenantId: user.tenantId,
      storeId: user.storeId,
      role: user.role,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    storeIds,
  );
  const tokens = await issueTokens(user.id, payload);

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

// ── Change Password ─────────────────────────────────────────────────────────

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  const valid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!valid) {
    throw new AuthenticationError("Current password is incorrect");
  }

  const samePassword = await verifyPassword(user.passwordHash, input.newPassword);
  if (samePassword) {
    throw new ValidationError("New password must be different from the current password");
  }

  const newHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    }),
    prisma.refreshToken.deleteMany({
      where: { userId },
    }),
  ]);

  logger.info({ userId }, "Password changed — all sessions revoked");

  return { success: true };
}

// ── Logout ──────────────────────────────────────────────────────────────────

export async function logout(refreshTokenValue: string) {
  await prisma.refreshToken.deleteMany({
    where: { token: refreshTokenValue },
  });
  return { success: true };
}
