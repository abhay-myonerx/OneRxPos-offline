// 3H.7 — server-side enforcement of discount caps + customer credit limit.
// Both throw a ValidationError (fail-closed) when a required manager override
// grant is absent. The over-cap DECISION is the SHARED `exceedsCap` (identical
// to the POS gate). The required grant context mirrors the frontend exactly:
//   discount → { DISCOUNT_OVER_CAP, `${mode}:${value}` }
//   credit   → { CREDIT_LIMIT_OVERRIDE, `${customerId}:${dueAmount}` }

import { exceedsCap, type RoleCaps } from "rx-pos-shared";
import { ValidationError } from "../../shared/errors";

export interface AcceptedOverride {
  action: string;
  context: string;
}

function hasGrant(accepted: AcceptedOverride[], action: string, context: string): boolean {
  return accepted.some((o) => o.action === action && o.context === context);
}

export function enforceDiscountCaps(args: {
  role: string;
  caps: RoleCaps;
  cartDiscount: number;
  cartDiscountMode: "flat" | "percent";
  subtotal: number;
  lines: Array<{ discount: number; base: number }>;
  accepted: AcceptedOverride[];
}): void {
  // Cart-level manual discount.
  if (args.cartDiscount > 0 &&
      exceedsCap({ role: args.role, mode: args.cartDiscountMode, value: args.cartDiscount, lineOrCartBase: args.subtotal, caps: args.caps })) {
    const context = `${args.cartDiscountMode}:${args.cartDiscount}`;
    if (!hasGrant(args.accepted, "DISCOUNT_OVER_CAP", context)) {
      throw new ValidationError("Cart discount exceeds your role's limit — manager approval required");
    }
  }
  // Per-line manual discounts (flat amounts).
  for (const line of args.lines) {
    if (line.discount > 0 &&
        exceedsCap({ role: args.role, mode: "flat", value: line.discount, lineOrCartBase: line.base, caps: args.caps })) {
      const context = `flat:${line.discount}`;
      if (!hasGrant(args.accepted, "DISCOUNT_OVER_CAP", context)) {
        throw new ValidationError("A line discount exceeds your role's limit — manager approval required");
      }
    }
  }
}

export function enforceCreditLimit(args: {
  customerId: string;
  dueAmount: number;
  creditLimit: number;
  currentBalance: number;
  accepted: AcceptedOverride[];
}): void {
  if (args.dueAmount <= 0) return; // fully paid — never a credit concern
  if (!(args.creditLimit > 0)) return; // 0 / unset = no limit
  if (args.currentBalance + args.dueAmount <= args.creditLimit) return; // within limit

  const context = `${args.customerId}:${args.dueAmount}`;
  if (!hasGrant(args.accepted, "CREDIT_LIMIT_OVERRIDE", context)) {
    throw new ValidationError("Customer's credit limit would be exceeded — manager approval required");
  }
}
