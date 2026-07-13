import { Role } from "@/types/enums/role.enums";
import type { AuthUser } from "@/features/auth/types/auth.types";
import type { PermissionV2 } from "./permissions-v2";

type PermissionLike = PermissionV2 | string;

/** Resolve permissions from authenticated user payload. */
function resolvePermissions(user: AuthUser | null | undefined): Set<string> {
  return new Set(user?.permissions ?? []);
}

/** Check if a user has a specific permission. */
export function hasPermission(
  user: AuthUser | null | undefined,
  permission: PermissionLike,
): boolean {
  if (!user) return false;
  if (user.role === Role.SUPER_ADMIN) return true;

  return resolvePermissions(user).has(permission);
}

/** Check if user has ALL given permissions. */
export function hasAllPermissions(
  user: AuthUser | null | undefined,
  ...permissions: PermissionLike[]
): boolean {
  if (!user) return false;
  if (user.role === Role.SUPER_ADMIN) return true;

  const userPermissions = resolvePermissions(user);
  return permissions.every((permission) => userPermissions.has(permission));
}

/** Check if user has ANY given permission. */
export function hasAnyPermission(
  user: AuthUser | null | undefined,
  ...permissions: PermissionLike[]
): boolean {
  if (!user) return false;
  if (user.role === Role.SUPER_ADMIN) return true;

  const userPermissions = resolvePermissions(user);
  return permissions.some((permission) => userPermissions.has(permission));
}

/**
 * Legacy role helpers.
 * New code should prefer permission checks instead of role checks.
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 4,
  [Role.ADMIN]: 3,
  [Role.MANAGER]: 2,
  [Role.HR_MANAGER]: 2,
  [Role.ACCOUNTANT]: 2,
  [Role.CASHIER]: 1,
  [Role.EMPLOYEE]: 0,
};

export function hasMinRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN || role === Role.SUPER_ADMIN;
}

export function canManageUsers(role: Role): boolean {
  return hasMinRole(role, Role.MANAGER);
}

export function canAccessReports(role: Role): boolean {
  return hasMinRole(role, Role.MANAGER);
}

export function canManageInventory(role: Role): boolean {
  return hasMinRole(role, Role.MANAGER);
}
