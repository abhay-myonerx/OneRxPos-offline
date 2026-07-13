import { describe, it, expect } from "vitest";

import * as rbacService from "../rbac.service";
import { Role } from "../../../generated/prisma/enums";
import { PERMISSIONS_V2 } from "../../../shared/permissions/v2-permissions";

describe("rbacService.listRoles", () => {
  it("returns all seven v2 roles with descriptions", () => {
    const roles = rbacService.listRoles();
    expect(roles).toHaveLength(7);
    const slugs = roles.map((r) => r.role);
    expect(slugs).toEqual([
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.MANAGER,
      Role.CASHIER,
      Role.HR_MANAGER,
      Role.ACCOUNTANT,
      Role.EMPLOYEE,
    ]);
    for (const r of roles) {
      expect(r.description).toBeTypeOf("string");
      expect(r.scope).toBeTypeOf("string");
      expect(r.permissionCount).toBe(r.permissions.length);
    }
  });

  it("SUPER_ADMIN holds every catalogued permission", () => {
    const sa = rbacService.getRole(Role.SUPER_ADMIN)!;
    expect(sa.permissionCount).toBe(Object.values(PERMISSIONS_V2).length);
  });

  it("EMPLOYEE holds ONLY ess.* permissions", () => {
    const emp = rbacService.getRole(Role.EMPLOYEE)!;
    for (const p of emp.permissions) {
      expect(p.startsWith("ess.")).toBe(true);
    }
  });

  it("CASHIER does not hold users.create", () => {
    const c = rbacService.getRole(Role.CASHIER)!;
    expect(c.permissions).not.toContain(PERMISSIONS_V2.USERS_CREATE);
  });
});

describe("rbacService.getEffectivePermissions", () => {
  it("returns role + permissions for a tenant ADMIN", () => {
    const result = rbacService.getEffectivePermissions({
      id: "u1",
      tenantId: "t1",
      role: Role.ADMIN,
    });
    expect(result.role).toBe(Role.ADMIN);
    expect(result.permissions).toContain(PERMISSIONS_V2.USERS_CREATE);
    expect(result.permissions).toContain(PERMISSIONS_V2.SALES_CREATE);
  });

  it("EMPLOYEE never gets non-ess permissions", () => {
    const result = rbacService.getEffectivePermissions({
      id: "u1",
      tenantId: "t1",
      role: Role.EMPLOYEE,
    });
    expect(result.permissions).not.toContain(PERMISSIONS_V2.SALES_CREATE);
    expect(result.permissions).toContain(PERMISSIONS_V2.ESS_PROFILE_READ);
  });
});

describe("rbacService.listPermissionCatalogue", () => {
  it("returns every defined v2 permission, sorted, deduplicated", () => {
    const cat = rbacService.listPermissionCatalogue();
    expect(cat.length).toBe(Object.values(PERMISSIONS_V2).length);
    const sorted = [...cat].sort();
    expect(cat).toEqual(sorted);
    expect(new Set(cat).size).toBe(cat.length);
  });
});
