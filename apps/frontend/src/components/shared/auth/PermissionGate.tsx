"use client";
import { useAuth } from "@/hooks/useAuth";
import type { PermissionV2 } from "@/lib/permissions/permissions-v2";
import { Role } from "@/types/enums/role.enums";

interface PermissionGateProps {
  children: React.ReactNode;
  /** Render children if the user has this permission. */
  permission?: PermissionV2;
  /** Render children if the user has ANY of these permissions. */
  anyOf?: PermissionV2[];
  /** Render children if the user has ALL of these permissions. */
  allOf?: PermissionV2[];
  /** Render children if the user has at least this role level. */
  minRole?: Role;
  /** What to render when access is denied (default: nothing). */
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on the current user's permissions.
 * Use `fallback` to show a disabled or alternative UI when access is denied.
 *
 * @example
 * <PermissionGate permission={PERMISSIONS_V2.PRODUCTS_UPDATE}>
 *   <Button onClick={handleDelete}>Delete</Button>
 * </PermissionGate>
 */
export function PermissionGate({
  children,
  permission,
  anyOf,
  allOf,
  minRole,
  fallback = null,
}: PermissionGateProps) {
  const { can, canAny, canAll, hasMinRole } = useAuth();

  const allowed =
    (!permission || can(permission)) &&
    (!anyOf?.length || canAny(...anyOf)) &&
    (!allOf?.length || canAll(...allOf)) &&
    (!minRole || hasMinRole(minRole));

  return <>{allowed ? children : fallback}</>;
}
