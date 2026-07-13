"use client";

import { useMemo } from "react";

import { useAppSelector } from "@/store/hooks";
import { Role } from "@/types/enums/role.enums";
import type { PermissionV2 } from "@/lib/permissions/permissions-v2";

export type AnyPermission = PermissionV2 | string;

export interface UsePermissionsResult {
  role: Role | null;
  /** True if the user is signed in. */
  isAuthenticated: boolean;
  /** Full set of permissions the user is known to hold. */
  permissions: Set<string>;
  /** True if the user holds the given permission. */
  can: (perm: AnyPermission) => boolean;
  /** True if the user holds at least one of the listed permissions. */
  canAny: (...perms: AnyPermission[]) => boolean;
  /** True if the user holds all of the listed permissions. */
  canAll: (...perms: AnyPermission[]) => boolean;
  /** True if the user has role >= SUPER_ADMIN. */
  isSuperAdmin: boolean;
}

export function usePermissions(): UsePermissionsResult {
  const user = useAppSelector((s) => s.auth.user);
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  const permissions = useMemo<Set<string>>(() => {
    if (!user) return new Set();
    // The backend is the single source of truth: `/auth/me` ships the
    // effective v2 permission catalogue in `user.permissions`. We trust it
    // verbatim (same contract as `has-permission.ts` and `RouteGuard`) —
    // no legacy v1 role-map fallback, which would otherwise reintroduce the
    // colon-style strings the backend no longer emits and silently diverge
    // from route-level gating.
    return new Set(user.permissions ?? []);
  }, [user]);

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  const can = (perm: AnyPermission): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return permissions.has(perm);
  };

  const canAny = (...perms: AnyPermission[]): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return perms.some((p) => permissions.has(p));
  };

  const canAll = (...perms: AnyPermission[]): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return perms.every((p) => permissions.has(p));
  };

  return {
    role: user?.role ?? null,
    isAuthenticated,
    permissions,
    can,
    canAny,
    canAll,
    isSuperAdmin,
  };
}
