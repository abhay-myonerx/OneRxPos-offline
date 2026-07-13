import { Request, Response, NextFunction } from "express";

import { Role } from "../generated/prisma/enums";
import { Permission, PERMISSIONS } from "../shared/types/enums";
import { AuthorizationError } from "@/shared/errors";

// ─── Role → Permission map ─────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<Role, Array<Permission | "*">> = {
  SUPER_ADMIN: ["*"],
  ADMIN: [
    PERMISSIONS.TENANT_MANAGE,
    PERMISSIONS.STORE_MANAGE,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.USER_PIN_RESET,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_WRITE,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.CATEGORY_WRITE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.SALE_VOID,
    PERMISSIONS.SALE_RETURN,
    PERMISSIONS.SALE_DISCOUNT_OVERRIDE,
    PERMISSIONS.SALE_CREDIT_OVERRIDE,
    PERMISSIONS.PRICE_OVERRIDE,
    PERMISSIONS.RX_CONSULT,
    PERMISSIONS.PURCHASE_READ,
    PERMISSIONS.PURCHASE_WRITE,
    PERMISSIONS.PURCHASE_RECEIVE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.SUPPLIER_READ,
    PERMISSIONS.SUPPLIER_WRITE,
    PERMISSIONS.EXPENSE_READ,
    PERMISSIONS.EXPENSE_WRITE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.SHIFT_MANAGE,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.RECEIPT_READ,
    PERMISSIONS.RECEIPT_WRITE,
    PERMISSIONS.RECEIPT_GENERATE,
    PERMISSIONS.DEVICE_ENROLL,
    PERMISSIONS.DEVICE_REVOKE,
  ],
  MANAGER: [
    PERMISSIONS.USER_MANAGE_STORE,
    PERMISSIONS.USER_PIN_RESET,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_WRITE,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.CATEGORY_WRITE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.SALE_VOID,
    PERMISSIONS.SALE_RETURN,
    PERMISSIONS.SALE_DISCOUNT_OVERRIDE,
    PERMISSIONS.SALE_CREDIT_OVERRIDE,
    PERMISSIONS.PRICE_OVERRIDE,
    PERMISSIONS.RX_CONSULT,
    PERMISSIONS.PURCHASE_READ,
    PERMISSIONS.PURCHASE_WRITE,
    PERMISSIONS.PURCHASE_RECEIVE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.SUPPLIER_READ,
    PERMISSIONS.SUPPLIER_WRITE,
    PERMISSIONS.EXPENSE_READ,
    PERMISSIONS.EXPENSE_WRITE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.SHIFT_MANAGE,
    PERMISSIONS.RECEIPT_READ,
    PERMISSIONS.RECEIPT_GENERATE,
    PERMISSIONS.DEVICE_ENROLL,
    PERMISSIONS.DEVICE_REVOKE,
  ],
  CASHIER: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.SALE_CREATE,
    PERMISSIONS.SALE_READ_OWN,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_WRITE,
    PERMISSIONS.SHIFT_OWN,
    PERMISSIONS.REPORT_READ_OWN,
    PERMISSIONS.RECEIPT_GENERATE,
  ],

  // HR_MANAGER and EMPLOYEE operate entirely within v2-gated modules
  // (HRM / payroll / ESS use requirePermission, not this legacy map),
  // so they need no v1 grants here.
  HR_MANAGER: [],
  EMPLOYEE: [],

  // ACCOUNTANT mirrors its v2 read-only finance scope onto the legacy
  // v1-gated modules (customers, suppliers, products, categories,
  // inventory, sales, purchases, expenses, reports). Without these,
  // ACCOUNTANT held the v2 read grants — and the sidebar showed the
  // links — but every one of those pages 403'd at the v1 authorize
  // layer. Reads only; write/manage verbs are deliberately omitted to
  // match the v2 catalogue (expense write is included because
  // ACCOUNTANT owns expense create/update/approve in v2).
  ACCOUNTANT: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.SALE_READ,
    PERMISSIONS.PURCHASE_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.SUPPLIER_READ,
    PERMISSIONS.EXPENSE_READ,
    PERMISSIONS.EXPENSE_WRITE,
    PERMISSIONS.REPORT_READ,
    PERMISSIONS.REPORT_EXPORT,
  ],
};

// ─── Standalone role→permission check ──────────────────────────────────────────
//
// Extracted from the `authorize()` middleware's body so non-HTTP callers
// (e.g. `override.service.ts`'s inline-PIN manager override, Phase 1.1
// Task 9 — checking whether the AUTHORIZER named in a request body holds a
// gated action's permission, not the calling session's role) can reuse the
// SAME `ROLE_PERMISSIONS` map + `"*"` wildcard rule rather than duplicating it.

/** Does `role` hold `perm`, honoring the SUPER_ADMIN `"*"` wildcard? */
export function userHasPermission(role: Role, perm: Permission): boolean {
  const userPerms = ROLE_PERMISSIONS[role] ?? [];
  if (userPerms.includes("*")) return true;
  return (userPerms as string[]).includes(perm);
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * Requires the authenticated user to hold ALL of the listed permissions.
 * Must be used AFTER authenticate() and tenantContext() in the chain.
 *
 * @example
 *   router.post("/", authenticate, tenantContext, authorize(PERMISSIONS.SALE_CREATE), handler)
 */
export function authorize(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthorizationError());
      return;
    }

    const userPerms = ROLE_PERMISSIONS[req.user.role] ?? [];

    // SUPER_ADMIN wildcard bypasses all checks
    if (userPerms.includes("*")) {
      next();
      return;
    }

    const missing = required.filter((p) => !(userPerms as string[]).includes(p));

    if (missing.length > 0) {
      next(new AuthorizationError(`Missing required permission(s): ${missing.join(", ")}`));
      return;
    }

    next();
  };
}
