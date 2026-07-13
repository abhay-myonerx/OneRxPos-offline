import { prisma } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { hashPassword } from "../../shared/utils/password";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";
import type {
  CreateSuperAdminInput,
  HardDeleteUserInput,
  BulkUserActionInput,
} from "./super-admin.validation";

const PLATFORM_TENANT_SLUG = "__platform__";

// ── List all SUPER_ADMIN accounts ───────────────────────────────────────────

export async function listSuperAdmins(pagination: PaginationParams) {
  const platformTenant = await prisma.tenant.findFirst({
    where: { slug: PLATFORM_TENANT_SLUG },
  });

  const where = platformTenant
    ? { tenantId: platformTenant.id, role: "SUPER_ADMIN" as const }
    : { role: "SUPER_ADMIN" as const };

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      ...buildPagination(pagination),
    }),
    prisma.user.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// ── Create a new SUPER_ADMIN ─────────────────────────────────────────────────

export async function createSuperAdmin(input: CreateSuperAdminInput, actorId: string) {
  // 1. Ensure platform tenant exists
  let platformTenant = await prisma.tenant.findFirst({
    where: { slug: PLATFORM_TENANT_SLUG },
  });

  if (!platformTenant) {
    platformTenant = await prisma.tenant.create({
      data: {
        name: "Platform",
        slug: PLATFORM_TENANT_SLUG,
        email: input.email,
        plan: "ENTERPRISE",
        status: "ACTIVE",
        settings: {},
      },
    });
    logger.info({ tenantId: platformTenant.id }, "Platform tenant auto-created");
  }

  // 2. Check uniqueness
  const existing = await prisma.user.findFirst({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("A user with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const superAdmin = await prisma.user.create({
    data: {
      tenantId: platformTenant.id,
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      role: "SUPER_ADMIN",
      isActive: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  logger.info({ createdBy: actorId, newSuperAdminId: superAdmin.id }, "SUPER_ADMIN created");

  return superAdmin;
}

// ── Hard delete a user (permanent, any tenant) ───────────────────────────────
// Use with caution — this removes the user record entirely.
// Sales, AuditLogs etc. retain userId as a nullable FK.

export async function hardDeleteUser(userId: string, actorId: string, _input: HardDeleteUserInput) {
  if (userId === actorId) {
    throw new ValidationError("You cannot delete your own account");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, tenantId: true },
  });

  if (!user) throw new NotFoundError("User", userId);

  // Prevent deleting the last SUPER_ADMIN
  if (user.role === "SUPER_ADMIN") {
    const superAdminCount = await prisma.user.count({
      where: { role: "SUPER_ADMIN", isActive: true },
    });
    if (superAdminCount <= 1) {
      throw new ValidationError(
        "Cannot delete the last active SUPER_ADMIN. Create another one first.",
      );
    }
  }

  // Revoke sessions first
  await prisma.refreshToken.deleteMany({ where: { userId } });

  // Hard delete
  await prisma.user.delete({ where: { id: userId } });

  logger.warn(
    { deletedUserId: userId, deletedEmail: user.email, actorId },
    "User HARD DELETED by SUPER_ADMIN",
  );

  return {
    success: true,
    message: `User ${user.email} permanently deleted`,
  };
}

// ── Soft delete a user (deactivate, cross-tenant) ───────────────────────────

export async function softDeleteUser(userId: string, actorId: string) {
  if (userId === actorId) {
    throw new ValidationError("You cannot deactivate your own account");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  await prisma.refreshToken.deleteMany({ where: { userId } });

  logger.info({ userId, actorId }, "User soft-deleted (deactivated) by SUPER_ADMIN");
  return { success: true, message: `User deactivated` };
}

// ── Restore (re-activate) a deleted user ─────────────────────────────────────

export async function restoreUser(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  if (user.isActive) {
    throw new ValidationError("User is already active");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: true },
  });

  logger.info({ userId, actorId }, "User restored by SUPER_ADMIN");
  return { success: true, message: "User restored successfully" };
}

// ── Bulk user actions ────────────────────────────────────────────────────────

export async function bulkUserAction(input: BulkUserActionInput, actorId: string) {
  const { userIds, action } = input;

  // Prevent acting on yourself
  if (userIds.includes(actorId)) {
    throw new ValidationError("You cannot perform bulk actions on your own account");
  }

  // Verify all users exist
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, role: true },
  });

  if (users.length !== userIds.length) {
    throw new NotFoundError(
      "Users",
      `Some user IDs not found: ${userIds.filter((id) => !users.find((u) => u.id === id)).join(", ")}`,
    );
  }

  let affected = 0;

  if (action === "DEACTIVATE") {
    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: false },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    affected = result.count;
  } else if (action === "ACTIVATE") {
    const result = await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: true },
    });
    affected = result.count;
  } else if (action === "HARD_DELETE") {
    // Prevent deleting last SUPER_ADMIN
    const superAdminIds = users.filter((u) => u.role === "SUPER_ADMIN").map((u) => u.id);
    if (superAdminIds.length > 0) {
      const totalSuperAdmins = await prisma.user.count({
        where: { role: "SUPER_ADMIN", isActive: true },
      });
      if (totalSuperAdmins - superAdminIds.length < 1) {
        throw new ValidationError(
          "Cannot delete all SUPER_ADMIN accounts. At least one must remain.",
        );
      }
    }

    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    const result = await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    affected = result.count;
  }

  logger.warn({ action, userIds, actorId, affected }, "Bulk user action executed by SUPER_ADMIN");

  return { success: true, affected, action };
}

// ── Platform-wide stats ──────────────────────────────────────────────────────

export async function getPlatformStats() {
  const [totalTenants, activeTenants, totalUsers, activeUsers, totalSales, totalRevenue] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.sale.count(),
      prisma.sale.aggregate({ _sum: { subtotal: true } }),
    ]);

  const byPlan = await prisma.tenant.groupBy({
    by: ["plan"],
    _count: { id: true },
  });

  const byStatus = await prisma.tenant.groupBy({
    by: ["status"],
    _count: { id: true },
  });

  return {
    tenants: {
      total: totalTenants,
      active: activeTenants,
      byPlan: byPlan.reduce(
        (acc, r) => ({ ...acc, [r.plan]: r._count.id }),
        {} as Record<string, number>,
      ),
      byStatus: byStatus.reduce(
        (acc, r) => ({ ...acc, [r.status]: r._count.id }),
        {} as Record<string, number>,
      ),
    },
    users: {
      total: totalUsers,
      active: activeUsers,
    },
    sales: {
      total: totalSales,
      totalRevenue: totalRevenue?._sum?.subtotal ?? 0,
    },
  };
}

// ── Get any user cross-tenant (for inspection) ───────────────────────────────

export async function getUserCrossTenant(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      tenantId: true,
      storeId: true,
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      store: { select: { id: true, name: true, code: true } },
      _count: { select: { sales: true, cashierShifts: true } },
    },
  });

  if (!user) throw new NotFoundError("User", userId);
  return user;
}

// ── List all users cross-tenant ──────────────────────────────────────────────

export async function listAllUsers(
  filters: {
    search?: string;
    role?: string;
    tenantId?: string;
    isActive?: boolean;
  },
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  if (filters.role) where.role = filters.role;
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  if (filters.search) {
    where.OR = [
      { firstName: ciContains(filters.search) },
      { lastName: ciContains(filters.search) },
      { email: ciContains(filters.search) },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        tenantId: true,
        tenant: { select: { id: true, name: true, slug: true } },
        store: { select: { id: true, name: true } },
      },
      ...buildPagination(pagination),
    }),
    prisma.user.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// ── Reset any user password (cross-tenant) ───────────────────────────────────

export async function resetAnyUserPassword(userId: string, newPassword: string, actorId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User", userId);

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ]);

  logger.warn({ userId, actorId }, "Password reset by SUPER_ADMIN");
  return { success: true, message: "Password reset successfully. All sessions revoked." };
}
