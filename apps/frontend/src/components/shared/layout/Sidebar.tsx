"use client";

import { Link, usePathname } from "@/shell/nav";
import { useEffect } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Warehouse,
  Receipt,
  Users,
  UserCircle,
  Truck,
  ShoppingBag,
  CreditCard,
  BarChart3,
  Store,
  Settings,
  ShieldAlert,
  Shield,
  X,
  PanelLeftClose,
  Briefcase,
  Building2,
  IdCard,
  Clock,
  CalendarClock,
  CalendarDays,
  Globe,
  DollarSign,
  Tag,
  Percent,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { toggleSidebar, setMobileSidebarOpen } from "@/features/settings/state/ui-prefs.slice";
import { ROUTES } from "@/constants/routes";
import { Role } from "@/types/enums/role.enums";
import { hasAnyPermission } from "@/lib/permissions/has-permission";
import type { Permission } from "@/lib/permissions/permissions";
import { PERMISSIONS_V2 } from "@/lib/permissions/permissions-v2";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  anyOf?: Permission[];
  roles?: Role[];
  exactRole?: Role;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Main",
    items: [
      {
        label: "Dashboard",
        href: ROUTES.DASHBOARD,
        icon: <LayoutDashboard className="h-5 w-5" />,
      },
      {
        label: "POS",
        href: ROUTES.POS,
        icon: <ShoppingCart className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.POS_ACCESS as Permission, PERMISSIONS_V2.SALES_CREATE as Permission],
      },
    ],
  },
  {
    title: "Catalog",
    items: [
      {
        label: "Products",
        href: ROUTES.PRODUCTS,
        icon: <Package className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.PRODUCTS_READ as Permission],
      },
      {
        label: "Categories",
        href: ROUTES.CATEGORIES,
        icon: <FolderTree className="h-5 w-5" />,
        anyOf: [
          PERMISSIONS_V2.CATEGORIES_READ as Permission,
          PERMISSIONS_V2.CATEGORIES_MANAGE as Permission,
        ],
      },
      {
        label: "Brands",
        href: ROUTES.BRANDS,
        icon: <Tag className="h-5 w-5" />,
        anyOf: [
          PERMISSIONS_V2.BRANDS_READ as Permission,
          PERMISSIONS_V2.BRANDS_MANAGE as Permission,
        ],
      },
      {
        label: "Levies",
        href: ROUTES.LEVIES,
        icon: <Percent className="h-5 w-5" />,
        anyOf: [
          PERMISSIONS_V2.LEVIES_READ as Permission,
          PERMISSIONS_V2.LEVIES_MANAGE as Permission,
        ],
      },
      {
        label: "Inventory",
        href: ROUTES.INVENTORY,
        icon: <Warehouse className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.INVENTORY_READ as Permission],
      },
    ],
  },
  {
    title: "Sales",
    items: [
      {
        label: "Sales",
        href: ROUTES.SALES,
        icon: <Receipt className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.SALES_READ as Permission],
      },
      {
        label: "Customers",
        href: ROUTES.CUSTOMERS,
        icon: <UserCircle className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.CUSTOMERS_READ as Permission],
      },
    ],
  },
  {
    title: "Procurement",
    items: [
      {
        label: "Suppliers",
        href: ROUTES.SUPPLIERS,
        icon: <Truck className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.SUPPLIERS_READ as Permission],
      },
      {
        label: "Purchases",
        href: ROUTES.PURCHASES,
        icon: <ShoppingBag className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.PURCHASES_READ as Permission],
      },
      {
        label: "Expenses",
        href: ROUTES.EXPENSES,
        icon: <CreditCard className="h-5 w-5" />,
        anyOf: [PERMISSIONS_V2.EXPENSES_READ as Permission],
      },
    ],
  },
  {
    title: "Human Resources",
    items: [
      {
        label: "Employees",
        href: ROUTES.HR_EMPLOYEES,
        icon: <Briefcase className="h-5 w-5" />,
        anyOf: ["hr.employees.read" as Permission],
      },
      {
        label: "Departments",
        href: ROUTES.HR_DEPARTMENTS,
        icon: <Building2 className="h-5 w-5" />,
        anyOf: ["hr.departments.read" as Permission],
      },
      {
        label: "Designations",
        href: ROUTES.HR_DESIGNATIONS,
        icon: <IdCard className="h-5 w-5" />,
        anyOf: ["hr.designations.read" as Permission],
      },
      {
        label: "Attendance",
        href: ROUTES.HR_ATTENDANCE,
        icon: <Clock className="h-5 w-5" />,
        anyOf: [
          "ess.attendance.read" as Permission,
          "hr.attendance.read.own" as Permission,
          "hr.attendance.read.team" as Permission,
          "hr.attendance.read.all" as Permission,
        ],
      },
      {
        label: "Shifts",
        href: ROUTES.HR_SHIFTS,
        icon: <CalendarClock className="h-5 w-5" />,
        // Admin shift templates/schedules. ESS-only roles manage their
        // own shifts at /me/shifts, so ess.shifts.read is intentionally
        // not a gate here (the page itself requires hr.shifts.* perms).
        anyOf: [
          "hr.shifts.read" as Permission,
          "hr.shifts.template.manage" as Permission,
          "hr.shifts.schedule.read" as Permission,
          "hr.shifts.schedule.create" as Permission,
        ],
      },
      {
        label: "Leave",
        href: ROUTES.HR_LEAVE,
        icon: <CalendarDays className="h-5 w-5" />,
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
      {
        label: "Holidays",
        href: ROUTES.HR_HOLIDAYS,
        icon: <Globe className="h-5 w-5" />,
        anyOf: [
          "hr.holidays.read" as Permission,
          "hr.holidays.manage" as Permission,
          "ess.holidays.read" as Permission,
        ],
      },
      {
        label: "Payroll",
        href: ROUTES.HR_PAYROLL,
        icon: <DollarSign className="h-5 w-5" />,
        // Admin payroll workspace (redirects to /hr/payroll/runs which
        // requires hr.payroll.read). ESS-only roles view their own
        // payslips at /me/payslips, not via this admin link.
        anyOf: ["hr.payroll.read" as Permission, "hr.payroll.run.create" as Permission],
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        label: "Reports",
        href: ROUTES.REPORTS,
        icon: <BarChart3 className="h-5 w-5" />,
        anyOf: [
          PERMISSIONS_V2.REPORTS_SALES_READ as Permission,
          PERMISSIONS_V2.REPORTS_PROFIT_READ as Permission,
          PERMISSIONS_V2.REPORTS_STOCK_READ as Permission,
          PERMISSIONS_V2.REPORTS_PURCHASES_READ as Permission,
          PERMISSIONS_V2.REPORTS_EXPENSES_READ as Permission,
        ],
      },
      {
        label: "HR Reports",
        href: ROUTES.REPORTS_HR,
        icon: <BarChart3 className="h-5 w-5" />,
        anyOf: [
          "hr.employees.read" as Permission,
          "reports.hr.attendance.read" as Permission,
          "reports.hr.payroll.read" as Permission,
          "tenant.audit.read" as Permission,
        ],
      },
      {
        label: "Users",
        href: ROUTES.USERS,
        icon: <Users className="h-5 w-5" />,
        anyOf: [
          PERMISSIONS_V2.USERS_READ as Permission,
          PERMISSIONS_V2.USERS_CREATE as Permission,
          PERMISSIONS_V2.USERS_UPDATE as Permission,
        ],
      },
      {
        label: "Permissions",
        href: ROUTES.USERS_PERMISSIONS,
        icon: <Shield className="h-5 w-5" />,
        anyOf: [
          PERMISSIONS_V2.USERS_UPDATE_ROLE as Permission,
          PERMISSIONS_V2.USERS_UPDATE as Permission,
        ],
      },
      {
        label: "Stores",
        href: ROUTES.STORES,
        icon: <Store className="h-5 w-5" />,
        // The Stores page is management-only — every endpoint it calls
        // (GET/POST/PATCH/DELETE /stores) is gated on store-manage, which
        // maps to the v2 create/update/delete grants (ADMIN+). Read-only
        // roles such as HR_MANAGER hold `stores.read` for store pickers but
        // cannot manage stores, so gate the link on the manage grants to
        // avoid surfacing a page that immediately 403s ("Failed to load
        // stores").
        anyOf: [
          PERMISSIONS_V2.STORES_CREATE as Permission,
          PERMISSIONS_V2.STORES_UPDATE as Permission,
          PERMISSIONS_V2.STORES_DELETE as Permission,
        ],
      },
      {
        label: "Settings",
        href: ROUTES.SETTINGS,
        icon: <Settings className="h-5 w-5" />,
        // The tenant settings API (GET/PATCH /tenants/me/settings) is
        // manage-level only, so a read-only role would just 403. Gate on
        // the update grant (ADMIN) until the backend splits read access.
        anyOf: [PERMISSIONS_V2.TENANT_SETTINGS_UPDATE as Permission],
      },
    ],
  },
  {
    title: "Super Admin",
    items: [
      {
        label: "All Tenants",
        href: ROUTES.ADMIN_TENANTS,
        icon: <ShieldAlert className="h-5 w-5" />,
        exactRole: Role.SUPER_ADMIN,
      },
    ],
  },
];

/**
 * Responsive navigation sidebar: collapses to icon-only on desktop (72px wide),
 * slides in as a full drawer on mobile. Nav items are built from `NAV_SECTIONS`
 * and filtered at render time based on the signed-in user's role and permissions,
 * so no server round-trip is needed for permission-based nav visibility.
 * The Super Admin section is visually distinct (amber) and guarded by `exactRole`.
 */
export function Sidebar() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.uiPrefs.sidebarOpen);
  const mobileOpen = useAppSelector((s) => s.uiPrefs.mobileSidebarOpen);
  const user = useAppSelector((s) => s.auth.user);
  const tenant = useAppSelector((s) => s.auth.tenant);
  const userRole = user?.role ?? Role.CASHIER;

  const firstInitial = user?.firstName?.[0]?.toUpperCase() ?? "";
  const lastInitial = user?.lastName?.[0]?.toUpperCase() ?? "";
  const initials = firstInitial || lastInitial ? `${firstInitial}${lastInitial}` : "?";

  const isSuperAdmin = userRole === Role.SUPER_ADMIN;

  // Close the mobile overlay whenever the user navigates to a new route.
  useEffect(() => {
    dispatch(setMobileSidebarOpen(false));
  }, [pathname, dispatch]);

  // Items with `exactRole` are visible only to that exact role (e.g. SUPER_ADMIN
  // tenant list). SUPER_ADMIN bypasses all other gates so they always see the full
  // nav. For everyone else, `anyOf` is evaluated against the user's permission set.
  const isItemVisible = (item: NavItem): boolean => {
    if (item.exactRole) return userRole === item.exactRole;
    if (isSuperAdmin) return true;
    if (item.roles && !item.roles.includes(userRole)) return false;
    if (item.anyOf?.length) return hasAnyPermission(user, ...item.anyOf);
    return true;
  };

  return (
    <>
      <div
        onClick={() => dispatch(setMobileSidebarOpen(false))}
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed left-0 z-50 flex flex-col overflow-hidden transition-all duration-200",
          "bg-white border-r border-slate-200 dark:bg-slate-900 dark:border-slate-800",
          open ? "lg:w-[256px]" : "lg:w-[72px]",
          "w-[280px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        style={{
          top: "var(--demo-banner-h, 0px)",
          height: "calc(100vh - var(--demo-banner-h, 0px))",
        }}
      >
        <div
          className={cn(
            "h-16 px-3 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-center gap-2",
            open || mobileOpen ? "justify-between" : "justify-center",
          )}
        >
          {open || mobileOpen ? (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white font-bold text-sm tracking-tight"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))",
                }}
                aria-hidden
              >
                Rx
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white leading-none">
                  RX POS
                </span>
                {tenant?.plan && (
                  <span className="text-[8px] text-slate-400 dark:text-slate-500 tracking-wide mt-0.5 truncate">
                    {tenant.plan} Plan
                  </span>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => dispatch(toggleSidebar())}
              className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl transition-transform hover:scale-105"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <span
                className="size-8 rounded-lg flex items-center justify-center text-white font-bold text-sm tracking-tight"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))",
                }}
                aria-hidden
              >
                Rx
              </span>
            </button>
          )}

          <div className="flex items-center gap-1">
            {(open || mobileOpen) && (
              <button
                onClick={() => dispatch(toggleSidebar())}
                className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                aria-label="Collapse sidebar"
                title="Collapse"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => dispatch(setMobileSidebarOpen(false))}
              className="lg:hidden h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {isSuperAdmin && (open || mobileOpen) && (
          <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-medium text-amber-700">Super Admin Mode</span>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;

            const isSuperAdminSection = section.title === "Super Admin";
            const showLabels = open || mobileOpen;

            return (
              <div key={section.title}>
                {showLabels && (
                  <p
                    className={cn(
                      "px-3 mb-2 text-[11px] font-medium uppercase tracking-wider",
                      isSuperAdminSection ? "text-amber-500" : "text-slate-400 dark:text-slate-500",
                    )}
                  >
                    {section.title}
                  </p>
                )}
                {showLabels && isSuperAdminSection && (
                  <div className="mx-3 mb-2 h-px bg-amber-100" />
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 group",
                          active
                            ? isSuperAdminSection
                              ? "bg-amber-50 text-amber-800 font-medium"
                              : "bg-slate-100 text-slate-900 font-medium dark:bg-slate-800 dark:text-slate-100"
                            : isSuperAdminSection
                              ? "text-amber-700/70 hover:bg-amber-50/60 hover:text-amber-700"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200",
                        )}
                        title={!showLabels ? item.label : undefined}
                      >
                        <span
                          className={cn(
                            "shrink-0",
                            active
                              ? isSuperAdminSection
                                ? "text-amber-700"
                                : "text-slate-600 dark:text-slate-300"
                              : isSuperAdminSection
                                ? "text-amber-400"
                                : "text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-300",
                          )}
                        >
                          {item.icon}
                        </span>
                        {showLabels && <span className="truncate">{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {user && (
          <div className="border-t border-slate-100 dark:border-slate-800 p-3 shrink-0">
            {open || mobileOpen ? (
              <div className="flex items-center gap-3 px-2 py-1.5">
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center shrink-0 ring-2 ring-white",
                    isSuperAdmin ? "bg-amber-50 text-amber-700" : "bg-primary-50 text-primary-700",
                  )}
                >
                  <span className="text-xs font-medium">{initials}</span>
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p
                    className={cn(
                      "text-[11px] truncate",
                      isSuperAdmin
                        ? "text-amber-500 font-medium"
                        : "text-slate-400 dark:text-slate-500",
                    )}
                  >
                    {user.role?.replace("_", " ")}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "h-9 w-9 mx-auto rounded-full flex items-center justify-center ring-2 ring-white",
                  isSuperAdmin ? "bg-amber-50 text-amber-700" : "bg-primary-50 text-primary-700",
                )}
                title={`${user.firstName} ${user.lastName} · ${user.role}`}
              >
                <span className="text-xs font-medium">{initials}</span>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
