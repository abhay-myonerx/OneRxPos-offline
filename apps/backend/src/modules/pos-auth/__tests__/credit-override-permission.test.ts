import { describe, it, expect } from "vitest";
import { userHasPermission } from "../../../middleware/authorize";
import { PERMISSIONS } from "../../../shared/types/enums";
import { Role } from "../../../generated/prisma/enums";

// 3H.7 — the CREDIT_LIMIT_OVERRIDE grant is authorizable by a manager/admin
// (mirrors the discount override) and NOT by a cashier.
describe("sale:credit:override permission", () => {
  it("is granted to MANAGER and ADMIN", () => {
    expect(userHasPermission(Role.MANAGER, PERMISSIONS.SALE_CREDIT_OVERRIDE)).toBe(true);
    expect(userHasPermission(Role.ADMIN, PERMISSIONS.SALE_CREDIT_OVERRIDE)).toBe(true);
  });
  it("is NOT held by a CASHIER", () => {
    expect(userHasPermission(Role.CASHIER, PERMISSIONS.SALE_CREDIT_OVERRIDE)).toBe(false);
  });
});
