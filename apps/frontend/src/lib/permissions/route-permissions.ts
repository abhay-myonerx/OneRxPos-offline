import { Role } from "@/types/enums/role.enums";
import { ROUTES } from "@/constants/routes";
import type { Permission } from "./permissions";
import { PERMISSIONS_V2 } from "./permissions-v2";

export interface RouteAccess {
  /** User must hold AT LEAST ONE of these permissions. Empty/undefined = no permission required. */
  anyOf?: Permission[];
  /** User must hold ALL of these permissions. */
  allOf?: Permission[];
  /** Restrict to specific roles (in addition to permission check). */
  roles?: Role[];
  /** Exact role match — overrides everything else if set (e.g. SUPER_ADMIN-only routes). */
  exactRole?: Role;
}

/**
 * Route access matrix. Order matters for prefix matching: more specific paths first.
 * The matcher selects the longest matching prefix.
 *
 * Permission strings are the **v2 dotted catalogue** — the same strings the
 * backend ships in `/auth/me`'s `permissions[]`. Using the legacy v1
 * colon-style identifiers (`product:read`) here would silently redirect
 * every non-HRM route back to /dashboard for ADMIN / MANAGER / CASHIER,
 * because their effective permissions only contain v2 dotted strings.
 */
export const ROUTE_ACCESS: Array<{ prefix: string; access: RouteAccess }> = [
  // Super Admin only
  { prefix: ROUTES.ADMIN_TENANTS, access: { exactRole: Role.SUPER_ADMIN } },
  { prefix: "/admin", access: { exactRole: Role.SUPER_ADMIN } },

  // Dashboard overview — all authenticated roles can see it (cashier sees own stats)
  {
    prefix: ROUTES.DASHBOARD,
    access: {
      roles: [
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.MANAGER,
        Role.CASHIER,
        Role.HR_MANAGER,
        Role.ACCOUNTANT,
        Role.EMPLOYEE,
      ],
    },
  },

  // Manager dashboard
  {
    prefix: ROUTES.MANAGER_DASHBOARD,
    access: {
      anyOf: [
        PERMISSIONS_V2.REPORTS_SALES_READ as Permission,
        PERMISSIONS_V2.REPORTS_PROFIT_READ as Permission,
      ],
    },
  },

  // POS — anyone who can access POS or create sales
  {
    prefix: ROUTES.POS,
    access: {
      anyOf: [PERMISSIONS_V2.POS_ACCESS as Permission, PERMISSIONS_V2.SALES_CREATE as Permission],
    },
  },

  // Catalog
  {
    prefix: ROUTES.PRODUCTS,
    access: { anyOf: [PERMISSIONS_V2.PRODUCTS_READ as Permission] },
  },
  {
    prefix: ROUTES.CATEGORIES,
    access: {
      anyOf: [
        PERMISSIONS_V2.CATEGORIES_READ as Permission,
        PERMISSIONS_V2.CATEGORIES_MANAGE as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.BRANDS,
    access: {
      anyOf: [PERMISSIONS_V2.BRANDS_READ as Permission, PERMISSIONS_V2.BRANDS_MANAGE as Permission],
    },
  },
  {
    prefix: ROUTES.INVENTORY,
    access: { anyOf: [PERMISSIONS_V2.INVENTORY_READ as Permission] },
  },

  // Sales
  {
    prefix: ROUTES.SALES,
    access: { anyOf: [PERMISSIONS_V2.SALES_READ as Permission] },
  },
  {
    prefix: ROUTES.CUSTOMERS,
    access: { anyOf: [PERMISSIONS_V2.CUSTOMERS_READ as Permission] },
  },

  // Procurement
  {
    prefix: ROUTES.SUPPLIERS,
    access: { anyOf: [PERMISSIONS_V2.SUPPLIERS_READ as Permission] },
  },
  {
    prefix: ROUTES.PURCHASES,
    access: { anyOf: [PERMISSIONS_V2.PURCHASES_READ as Permission] },
  },
  {
    prefix: ROUTES.EXPENSES,
    access: { anyOf: [PERMISSIONS_V2.EXPENSES_READ as Permission] },
  },

  // HR Payroll — most sensitive HR data (salaries). Mirrors the Sidebar gate so
  // a direct URL is treated the same as the (hidden) nav link: roles without a
  // payroll grant (CASHIER/MANAGER/EMPLOYEE) are redirected to their landing
  // instead of loading the admin shell. UX guard only — the backend 403s the
  // data regardless. Other /hr/* routes remain page-level-gated (dual-mode ESS
  // overlap).
  {
    prefix: ROUTES.HR_PAYROLL,
    access: {
      anyOf: [
        "hr.payroll.read" as Permission,
        "hr.payroll.run.create" as Permission,
        "hr.payroll.run.approve" as Permission,
        "hr.payroll.run.disburse" as Permission,
      ],
    },
  },

  // Remaining /hr/* routes. These mirror the Sidebar gates so a
  // direct URL is treated the same as the (hidden) nav link — roles without the
  // grant are redirected to their landing instead of rendering the shell then a
  // PermissionDenied card. Dual-mode: the `ess.*` strings keep ESS-capable
  // roles (MANAGER, etc.) from being wrongly redirected. UX guard only — the
  // backend 403s the data regardless. The matcher uses longest-prefix match, so
  // these never shadow the more-specific /hr/payroll rule above.
  {
    prefix: ROUTES.HR_EMPLOYEES,
    access: { anyOf: ["hr.employees.read" as Permission] },
  },
  {
    prefix: ROUTES.HR_DEPARTMENTS,
    access: { anyOf: ["hr.departments.read" as Permission] },
  },
  {
    prefix: ROUTES.HR_DESIGNATIONS,
    access: { anyOf: ["hr.designations.read" as Permission] },
  },
  {
    prefix: ROUTES.HR_ATTENDANCE,
    access: {
      anyOf: [
        "hr.attendance.read.own" as Permission,
        "hr.attendance.read.team" as Permission,
        "hr.attendance.read.all" as Permission,
        "ess.attendance.read" as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.HR_SHIFTS,
    access: {
      anyOf: [
        "hr.shifts.read" as Permission,
        "hr.shifts.template.manage" as Permission,
        "hr.shifts.schedule.read" as Permission,
        "hr.shifts.schedule.create" as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.HR_LEAVE,
    access: {
      anyOf: [
        "hr.leave.types.read" as Permission,
        "hr.leave.policies.read" as Permission,
        "hr.leave.balances.read.own" as Permission,
        "hr.leave.balances.read.team" as Permission,
        "hr.leave.balances.read.all" as Permission,
        "hr.leave.request.read.own" as Permission,
        "hr.leave.request.read.team" as Permission,
        "hr.leave.request.read.all" as Permission,
        "ess.leave.balance.read" as Permission,
        "ess.leave.request.read" as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.HR_HOLIDAYS,
    access: {
      anyOf: [
        "hr.holidays.read" as Permission,
        "hr.holidays.manage" as Permission,
        "ess.holidays.read" as Permission,
      ],
    },
  },

  {
    prefix: ROUTES.REPORTS_HR,
    access: {
      anyOf: [
        "hr.employees.read" as Permission,
        "reports.hr.attendance.read" as Permission,
        "reports.hr.payroll.read" as Permission,
        "tenant.audit.read" as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.REPORTS,
    access: {
      anyOf: [
        PERMISSIONS_V2.REPORTS_SALES_READ as Permission,
        PERMISSIONS_V2.REPORTS_PROFIT_READ as Permission,
        PERMISSIONS_V2.REPORTS_STOCK_READ as Permission,
        PERMISSIONS_V2.REPORTS_PURCHASES_READ as Permission,
        PERMISSIONS_V2.REPORTS_EXPENSES_READ as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.USERS,
    access: {
      anyOf: [
        PERMISSIONS_V2.USERS_READ as Permission,
        PERMISSIONS_V2.USERS_CREATE as Permission,
        PERMISSIONS_V2.USERS_UPDATE as Permission,
      ],
    },
  },
  {
    prefix: ROUTES.STORES,
    access: {
      anyOf: [PERMISSIONS_V2.STORES_READ as Permission, PERMISSIONS_V2.STORES_UPDATE as Permission],
    },
  },
  {
    prefix: ROUTES.SETTINGS,
    // Tenant settings API is manage-level only; gate on the update grant
    // (ADMIN) so read-only roles aren't redirected into a 403 page.
    access: {
      anyOf: [PERMISSIONS_V2.TENANT_SETTINGS_UPDATE as Permission],
    },
  },
  {
    prefix: ROUTES.RECEIPT_SETTINGS,
    access: {
      anyOf: ["receipts.template.read" as Permission, "receipts.template.update" as Permission],
    },
  },
];

/** Find the access rule matching the given pathname (longest-prefix match). */
export function getRouteAccess(pathname: string): RouteAccess | null {
  let matched: { prefix: string; access: RouteAccess } | null = null;
  for (const entry of ROUTE_ACCESS) {
    if (pathname === entry.prefix || pathname.startsWith(entry.prefix + "/")) {
      if (!matched || entry.prefix.length > matched.prefix.length) {
        matched = entry;
      }
    }
  }
  return matched?.access ?? null;
}

/**
 * Pick a sensible landing page for a user based on their role.
 * Used to redirect when they hit a route they don't have access to.
 */
export function getDefaultLandingForRole(role: Role | undefined): string {
  switch (role) {
    case Role.SUPER_ADMIN:
      return ROUTES.ADMIN_TENANTS;
    case Role.ADMIN:
    case Role.MANAGER:
    case Role.HR_MANAGER:
    case Role.ACCOUNTANT:
      return ROUTES.DASHBOARD;
    case Role.CASHIER:
      return ROUTES.POS; // Cashier primary landing is POS; they can navigate to /dashboard
    case Role.EMPLOYEE:
      return ROUTES.ESS_HOME;
    default:
      return ROUTES.LOGIN;
  }
}
