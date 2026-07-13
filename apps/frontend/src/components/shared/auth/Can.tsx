"use client";

// <Can /> — declarative permission gate.
//
// Renders `children` only if the current user holds the required
// permission(s). Optionally renders a `fallback`. SUPER_ADMIN always
// passes.
//
// Examples:
//
//   <Can perm="products.create"><AddProductButton /></Can>
//
//   <Can anyOf={["sales.read", "sales.read.details"]}>
//     <SalesList />
//   </Can>
//
//   <Can allOf={["hr.payroll.read", "hr.payroll.run.approve"]}>
//     <ApprovePayrollButton />
//   </Can>
//
//   <Can perm="users.create" fallback={<span>Ask an admin</span>}>
//     <InviteUserButton />
//   </Can>
//
// Reminder: this hides UI only. The backend still enforces permissions
// on every request — a denial returns 403 AUTHORIZATION_ERROR.

import { type ReactNode } from "react";

import { usePermissions, type AnyPermission } from "@/hooks/usePermissions";

interface CanPropsBase {
  children: ReactNode;
  fallback?: ReactNode;
}

interface CanSingleProps extends CanPropsBase {
  perm: AnyPermission;
  anyOf?: never;
  allOf?: never;
}

interface CanAnyOfProps extends CanPropsBase {
  perm?: never;
  anyOf: AnyPermission[];
  allOf?: never;
}

interface CanAllOfProps extends CanPropsBase {
  perm?: never;
  anyOf?: never;
  allOf: AnyPermission[];
}

export type CanProps = CanSingleProps | CanAnyOfProps | CanAllOfProps;

export function Can(props: CanProps) {
  const { can, canAny, canAll } = usePermissions();

  let allowed = false;
  if ("perm" in props && props.perm) {
    allowed = can(props.perm);
  } else if ("anyOf" in props && props.anyOf) {
    allowed = canAny(...props.anyOf);
  } else if ("allOf" in props && props.allOf) {
    allowed = canAll(...props.allOf);
  }

  if (allowed) return <>{props.children}</>;
  if (props.fallback !== undefined) return <>{props.fallback}</>;
  return null;
}
