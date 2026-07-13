// Pure service-layer helpers used by the RBAC controller. Stateless until
// the PermissionGrant table lands.

import { Role } from "../../generated/prisma/enums";
import {
  PERMISSIONS_V2,
  ROLE_PERMISSIONS_V2,
  type PermissionV2,
} from "../../shared/permissions/v2-permissions";
import { resolveUserPermissionsArray, type AuthUserLike } from "../../shared/permissions/resolver";

const ALL_ROLES: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGER,
  Role.CASHIER,
  Role.HR_MANAGER,
  Role.ACCOUNTANT,
  Role.EMPLOYEE,
];

const ROLE_DESCRIPTIONS: Record<Role, { description: string; scope: string }> = {
  SUPER_ADMIN: {
    description: "Platform operator with cross-tenant access",
    scope: "__platform__ tenant ONLY",
  },
  ADMIN: {
    description: "Business owner / tenant administrator",
    scope: "One tenant (full)",
  },
  MANAGER: {
    description: "Store manager or operations lead",
    scope: "One tenant + assigned stores",
  },
  CASHIER: {
    description: "Front-desk staff running the POS",
    scope: "One tenant + assigned store",
  },
  HR_MANAGER: {
    description: "HR / People Ops staff",
    scope: "One tenant",
  },
  ACCOUNTANT: {
    description: "Financial visibility without operational write",
    scope: "One tenant",
  },
  EMPLOYEE: {
    description: "ESS portal user (kitchen staff, cleaners, drivers)",
    scope: "Self-scope only",
  },
};

export interface RoleDescriptor {
  role: Role;
  description: string;
  scope: string;
  permissionCount: number;
  permissions: PermissionV2[];
}

export function listRoles(): RoleDescriptor[] {
  return ALL_ROLES.map((role) => {
    const perms = [...(ROLE_PERMISSIONS_V2[role] ?? [])].sort();
    return {
      role,
      description: ROLE_DESCRIPTIONS[role].description,
      scope: ROLE_DESCRIPTIONS[role].scope,
      permissionCount: perms.length,
      permissions: perms as PermissionV2[],
    };
  });
}

export function getRole(role: Role): RoleDescriptor | null {
  if (!ALL_ROLES.includes(role)) return null;
  const perms = [...(ROLE_PERMISSIONS_V2[role] ?? [])].sort();
  return {
    role,
    description: ROLE_DESCRIPTIONS[role].description,
    scope: ROLE_DESCRIPTIONS[role].scope,
    permissionCount: perms.length,
    permissions: perms as PermissionV2[],
  };
}

export function listPermissionCatalogue(): PermissionV2[] {
  return Object.values(PERMISSIONS_V2).sort() as PermissionV2[];
}

export function getEffectivePermissions(user: AuthUserLike): {
  role: Role;
  permissions: PermissionV2[];
} {
  return {
    role: user.role,
    permissions: resolveUserPermissionsArray(user),
  };
}
