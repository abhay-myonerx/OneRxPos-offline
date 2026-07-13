// RBAC matrix invariants — locks in the separation-of-duties and
// least-privilege guarantees of ROLE_PERMISSIONS_V2 so a future edit can't
// silently grant a sensitive permission to the wrong role.
//
// See docs/v2/RBAC_AUDIT.md and docs/v2/5.RX-POS-v2-RBAC-Matrix.md.

import { describe, it, expect } from "vitest";

import { Role } from "../../../generated/prisma/enums";
import { ROLE_PERMISSIONS_V2, PERMISSIONS_V2 } from "../v2-permissions";

const CATALOG = new Set<string>(Object.values(PERMISSIONS_V2));

function permsOf(role: Role): Set<string> {
  return new Set<string>(ROLE_PERMISSIONS_V2[role] ?? []);
}

describe("RBAC matrix: catalogue integrity", () => {
  it("every role's permissions are real catalogue entries (no typos/orphans)", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS_V2) as Role[]) {
      for (const p of ROLE_PERMISSIONS_V2[role]) {
        expect(CATALOG.has(p), `${role} holds unknown permission "${p}"`).toBe(true);
      }
    }
  });

  it("SUPER_ADMIN holds the entire catalogue", () => {
    expect(permsOf(Role.SUPER_ADMIN).size).toBe(CATALOG.size);
  });
});

describe("RBAC matrix: least privilege", () => {
  it("EMPLOYEE holds ONLY ess.* permissions (ESS-only role)", () => {
    const emp = [...permsOf(Role.EMPLOYEE)];
    expect(emp.length).toBeGreaterThan(0);
    for (const p of emp) {
      expect(p.startsWith("ess."), `EMPLOYEE must not hold non-ESS perm "${p}"`).toBe(true);
    }
  });

  it("platform.* permissions are exclusive to SUPER_ADMIN", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS_V2) as Role[]) {
      if (role === Role.SUPER_ADMIN) continue;
      const platform = [...permsOf(role)].filter((p) => p.startsWith("platform."));
      expect(platform, `${role} must not hold platform.* perms`).toEqual([]);
    }
  });

  it("tenant.settings.update is restricted to ADMIN (+SUPER_ADMIN)", () => {
    for (const role of [
      Role.MANAGER,
      Role.CASHIER,
      Role.ACCOUNTANT,
      Role.HR_MANAGER,
      Role.EMPLOYEE,
    ]) {
      expect(permsOf(role).has(PERMISSIONS_V2.TENANT_SETTINGS_UPDATE)).toBe(false);
    }
    expect(permsOf(Role.ADMIN).has(PERMISSIONS_V2.TENANT_SETTINGS_UPDATE)).toBe(true);
  });

  it("CASHIER cannot manage users, approve payroll, or terminate employees", () => {
    const c = permsOf(Role.CASHIER);
    expect(c.has(PERMISSIONS_V2.USERS_CREATE)).toBe(false);
    expect(c.has(PERMISSIONS_V2.HR_PAYROLL_RUN_APPROVE)).toBe(false);
    expect(c.has(PERMISSIONS_V2.HR_EMPLOYEES_TERMINATE)).toBe(false);
  });
});

describe("RBAC matrix: payroll separation of duties", () => {
  // The processor (HR) must not also be the approver/disburser (Finance).
  it("HR_MANAGER can CREATE/PROCESS a run but NOT APPROVE or DISBURSE", () => {
    const hr = permsOf(Role.HR_MANAGER);
    expect(hr.has(PERMISSIONS_V2.HR_PAYROLL_RUN_CREATE)).toBe(true);
    expect(hr.has(PERMISSIONS_V2.HR_PAYROLL_RUN_PROCESS)).toBe(true);
    expect(hr.has(PERMISSIONS_V2.HR_PAYROLL_RUN_APPROVE)).toBe(false);
    expect(hr.has(PERMISSIONS_V2.HR_PAYROLL_RUN_DISBURSE)).toBe(false);
  });

  it("ACCOUNTANT can APPROVE/DISBURSE a run but NOT CREATE or PROCESS", () => {
    const acc = permsOf(Role.ACCOUNTANT);
    expect(acc.has(PERMISSIONS_V2.HR_PAYROLL_RUN_APPROVE)).toBe(true);
    expect(acc.has(PERMISSIONS_V2.HR_PAYROLL_RUN_DISBURSE)).toBe(true);
    expect(acc.has(PERMISSIONS_V2.HR_PAYROLL_RUN_CREATE)).toBe(false);
    expect(acc.has(PERMISSIONS_V2.HR_PAYROLL_RUN_PROCESS)).toBe(false);
  });
});
