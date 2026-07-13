// Resolves the effective permission set for an authenticated user.
//
// In v2.0 there is no PermissionGrant table yet, so the resolver
// returns the default permission set bound to the user's role. The resolver
// is the single chokepoint that `requirePermission` middleware and the
// `/auth/me/permissions` endpoint both call — when PermissionGrant lands,
// only this file changes.

import { Role } from "../../generated/prisma/enums";
import { ROLE_PERMISSIONS_V2, type PermissionV2 } from "./v2-permissions";

export interface AuthUserLike {
  id: string;
  role: Role;
  tenantId: string;
}

/**
 * Returns the user's effective v2 permissions as a Set.
 *
 * SUPER_ADMIN gets every catalogued permission (no wildcards in the set —
 * the middleware short-circuits for SUPER_ADMIN before consulting the set).
 */
export function resolveUserPermissions(user: AuthUserLike): Set<string> {
  const perms = ROLE_PERMISSIONS_V2[user.role] ?? [];
  return new Set<string>(perms);
}

/**
 * Returns the user's effective permissions as a sorted array (suitable for
 * shipping in `/auth/me` responses and JWT payloads).
 */
export function resolveUserPermissionsArray(user: AuthUserLike): PermissionV2[] {
  const set = resolveUserPermissions(user);
  return Array.from(set).sort() as PermissionV2[];
}

export function isSuperAdmin(user: AuthUserLike): boolean {
  return user.role === Role.SUPER_ADMIN;
}
