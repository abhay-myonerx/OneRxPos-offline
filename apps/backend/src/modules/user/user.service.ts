// User business logic — CRUD, role management, password reset

import { prisma, TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { hashPassword } from "../../shared/utils/password";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { AuthorizationError } from "../../shared/errors/AuthorizationError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";
import type { CreateUserInput, UpdateUserInput, ResetPasswordInput } from "./user.validation";

// ── Role hierarchy (higher index = higher rank) ─────────────────────────────

const ROLE_RANK: Record<string, number> = {
  CASHIER: 0,
  MANAGER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

function canManageRole(actorRole: string, targetRole: string): boolean {
  return (ROLE_RANK[actorRole] ?? 0) > (ROLE_RANK[targetRole] ?? 0);
}

// ── List users ──────────────────────────────────────────────────────────────

export async function listUsers(
  db: TenantPrismaClient,
  actorRole: string,
  actorStoreId: string | null,
  filters: {
    search?: string;
    role?: string;
    storeId?: string;
    isActive?: boolean;
  },
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  // MANAGER can only see users in their own store
  if (actorRole === "MANAGER" && actorStoreId) {
    where.storeId = actorStoreId;
  }

  if (filters.role) where.role = filters.role;
  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  if (filters.search) {
    where.OR = [
      { firstName: ciContains(filters.search) },
      { lastName: ciContains(filters.search) },
      { email: ciContains(filters.search) },
    ];
  }

  const [data, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        storeId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        store: { select: { id: true, name: true, code: true } },
      },
      ...buildPagination(pagination),
    }),
    db.user.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// ── Get user by ID ──────────────────────────────────────────────────────────

export async function getUserById(
  db: TenantPrismaClient,
  userId: string,
  actorRole: string,
  actorStoreId: string | null,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      storeId: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      store: { select: { id: true, name: true, code: true } },
      _count: { select: { sales: true, cashierShifts: true } },
    },
  });

  if (!user) throw new NotFoundError("User", userId);

  // MANAGER can only view users in their store
  if (actorRole === "MANAGER" && actorStoreId && user.storeId !== actorStoreId) {
    throw new AuthorizationError("You can only view users in your own store");
  }

  return user;
}

// ── Create user ─────────────────────────────────────────────────────────────

export async function createUser(
  db: TenantPrismaClient,
  tenantId: string,
  actorRole: string,
  actorStoreId: string | null,
  input: CreateUserInput,
) {
  // 1. Role hierarchy — can't create a user with same or higher role
  if (!canManageRole(actorRole, input.role)) {
    throw new AuthorizationError(`You cannot create a user with the ${input.role} role`);
  }

  // 2. MANAGER can only create users in their own store
  if (actorRole === "MANAGER") {
    if (!actorStoreId) {
      throw new AuthorizationError("You must be assigned to a store to create users");
    }
    if (input.storeId && input.storeId !== actorStoreId) {
      throw new AuthorizationError("You can only create users in your own store");
    }
    // Force the user into the manager's store
    input.storeId = actorStoreId;
  }

  // 3. Validate store exists (if provided)
  if (input.storeId) {
    const store = await db.store.findUnique({ where: { id: input.storeId } });
    if (!store || !store.isActive) {
      throw new ValidationError("Store not found or is inactive");
    }
  }

  // 4. Check email uniqueness within tenant (friendlier than P2002)
  const existing = await db.user.findFirst({
    where: { email: input.email },
  });
  if (existing) {
    throw new ConflictError("A user with this email already exists in this account");
  }

  // 5. Hash password and create
  const passwordHash = await hashPassword(input.password);

  const user = await db.user.create({
    data: {
      tenantId,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      role: input.role,
      storeId: input.storeId ?? null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      storeId: true,
      isActive: true,
      createdAt: true,
    },
  });

  logger.info({ tenantId, userId: user.id, role: user.role }, "User created");

  return user;
}

// ── Update user ─────────────────────────────────────────────────────────────

export async function updateUser(
  db: TenantPrismaClient,
  userId: string,
  actorRole: string,
  actorStoreId: string | null,
  actorId: string,
  input: UpdateUserInput,
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  // Can't modify your own role or deactivate yourself
  if (userId === actorId) {
    if (input.role && input.role !== user.role) {
      throw new ValidationError("You cannot change your own role");
    }
    if (input.isActive === false) {
      throw new ValidationError("You cannot deactivate your own account");
    }
  }

  // Role hierarchy — can't edit a user with same or higher role
  if (!canManageRole(actorRole, user.role)) {
    throw new AuthorizationError(`You cannot modify a user with the ${user.role} role`);
  }

  // If promoting, can't promote to same or higher than your own role
  if (input.role && !canManageRole(actorRole, input.role)) {
    throw new AuthorizationError(`You cannot assign the ${input.role} role`);
  }

  // MANAGER scope check
  if (actorRole === "MANAGER" && actorStoreId) {
    if (user.storeId !== actorStoreId) {
      throw new AuthorizationError("You can only edit users in your own store");
    }
    if (input.storeId && input.storeId !== actorStoreId) {
      throw new AuthorizationError("You can only assign users to your own store");
    }
  }

  // Validate new store if changing
  if (input.storeId && input.storeId !== user.storeId) {
    const store = await db.store.findUnique({ where: { id: input.storeId } });
    if (!store || !store.isActive) {
      throw new ValidationError("Store not found or is inactive");
    }
  }

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.storeId !== undefined && { storeId: input.storeId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      storeId: true,
      isActive: true,
      updatedAt: true,
    },
  });

  // If deactivated, revoke all their sessions
  if (input.isActive === false) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    logger.info({ userId }, "User deactivated — sessions revoked");
  }

  logger.info({ userId }, "User updated");
  return updated;
}

// ── Admin reset password ────────────────────────────────────────────────────

export async function resetPassword(
  db: TenantPrismaClient,
  userId: string,
  actorRole: string,
  input: ResetPasswordInput,
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  // Can't reset password for same or higher role
  if (!canManageRole(actorRole, user.role)) {
    throw new AuthorizationError(`You cannot reset the password of a ${user.role}`);
  }

  const passwordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    // Force re-login on all devices
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);

  logger.info({ userId }, "Password reset by admin — sessions revoked");
  return { success: true };
}

// ── Delete user (soft) ──────────────────────────────────────────────────────

export async function deleteUser(
  db: TenantPrismaClient,
  userId: string,
  actorRole: string,
  actorId: string,
) {
  if (userId === actorId) {
    throw new ValidationError("You cannot delete your own account");
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  if (!canManageRole(actorRole, user.role)) {
    throw new AuthorizationError(`You cannot delete a user with the ${user.role} role`);
  }

  // Soft delete + revoke sessions
  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await prisma.refreshToken.deleteMany({ where: { userId } });

  logger.info({ userId }, "User soft-deleted (deactivated) — sessions revoked");
  return { success: true, type: "soft", message: "User deactivated successfully" };
}

// ── Restore user (re-activate) ──────────────────────────────────────────────

export async function restoreUser(
  db: TenantPrismaClient,
  userId: string,
  actorRole: string,
  actorId: string,
) {
  if (userId === actorId) {
    throw new ValidationError("You cannot restore your own account");
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  if (!canManageRole(actorRole, user.role)) {
    throw new AuthorizationError(`You cannot restore a user with the ${user.role} role`);
  }

  if (user.isActive) {
    throw new ValidationError("User is already active");
  }

  await db.user.update({
    where: { id: userId },
    data: { isActive: true },
  });

  logger.info({ userId }, "User restored (re-activated)");
  return { success: true, message: "User restored successfully" };
}

// ── Update own profile (self) ────────────────────────────────────────────────

export async function updateOwnProfile(
  db: TenantPrismaClient,
  userId: string,
  input: {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
  },
) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.phone !== undefined && { phone: input.phone }),
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      storeId: true,
      isActive: true,
      updatedAt: true,
    },
  });

  logger.info({ userId }, "User updated own profile");
  return updated;
}
