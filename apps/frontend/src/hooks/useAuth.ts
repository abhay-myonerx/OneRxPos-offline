"use client";
import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types/enums/role.enums";
import {
  hasMinRole,
  isAdmin,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from "@/lib/permissions/has-permission";
import type { PermissionV2 } from "@/lib/permissions/permissions-v2";

export function useAuth() {
  const { user, tenant, isAuthenticated, isDemoMode } = useAppSelector((s) => s.auth);

  return {
    user,
    tenant,
    isAuthenticated,
    isDemoMode,
    role: user?.role ?? Role.CASHIER,
    isAdmin: user ? isAdmin(user.role) : false,
    hasMinRole: (required: Role) => (user ? hasMinRole(user.role, required) : false),
    /** True if the user has the given permission. SUPER_ADMIN always passes. */
    can: (permission: PermissionV2) => hasPermission(user, permission),
    /** True if the user has ANY of the given permissions. */
    canAny: (...permissions: PermissionV2[]) => hasAnyPermission(user, ...permissions),
    /** True if the user has ALL of the given permissions. */
    canAll: (...permissions: PermissionV2[]) => hasAllPermissions(user, ...permissions),
  };
}
