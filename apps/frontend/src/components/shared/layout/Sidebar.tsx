"use client";

import { Link, usePathname } from "@/shell/nav";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { setMobileSidebarOpen } from "@/features/settings/state/ui-prefs.slice";
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

interface VisibleNavItem extends NavItem {
  sectionTitle: string;
  isSuperAdminSection: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Main",
    items: [
      {
        label: "Dashboard",
        href: ROUTES.DASHBOARD,
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      {
        label: "POS",
        href: ROUTES.POS,
        icon: <ShoppingCart className="h-4 w-4" />,
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
        icon: <Package className="h-4 w-4" />,
        anyOf: [PERMISSIONS_V2.PRODUCTS_READ as Permission],
      },
      {
        label: "Categories",
        href: ROUTES.CATEGORIES,
        icon: <FolderTree className="h-4 w-4" />,
        anyOf: [
          PERMISSIONS_V2.CATEGORIES_READ as Permission,
          PERMISSIONS_V2.CATEGORIES_MANAGE as Permission,
        ],
      },
      {
        label: "Brands",
        href: ROUTES.BRANDS,
        icon: <Tag className="h-4 w-4" />,
        anyOf: [
          PERMISSIONS_V2.BRANDS_READ as Permission,
          PERMISSIONS_V2.BRANDS_MANAGE as Permission,
        ],
      },
      {
        label: "Levies",
        href: ROUTES.LEVIES,
        icon: <Percent className="h-4 w-4" />,
        anyOf: [
          PERMISSIONS_V2.LEVIES_READ as Permission,
          PERMISSIONS_V2.LEVIES_MANAGE as Permission,
        ],
      },
      {
        label: "Inventory",
        href: ROUTES.INVENTORY,
        icon: <Warehouse className="h-4 w-4" />,
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
        icon: <Receipt className="h-4 w-4" />,
        anyOf: [PERMISSIONS_V2.SALES_READ as Permission],
      },
      {
        label: "Customers",
        href: ROUTES.CUSTOMERS,
        icon: <UserCircle className="h-4 w-4" />,
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
        icon: <Truck className="h-4 w-4" />,
        anyOf: [PERMISSIONS_V2.SUPPLIERS_READ as Permission],
      },
      {
        label: "Purchases",
        href: ROUTES.PURCHASES,
        icon: <ShoppingBag className="h-4 w-4" />,
        anyOf: [PERMISSIONS_V2.PURCHASES_READ as Permission],
      },
      {
        label: "Expenses",
        href: ROUTES.EXPENSES,
        icon: <CreditCard className="h-4 w-4" />,
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
        icon: <Briefcase className="h-4 w-4" />,
        anyOf: ["hr.employees.read" as Permission],
      },
      {
        label: "Departments",
        href: ROUTES.HR_DEPARTMENTS,
        icon: <Building2 className="h-4 w-4" />,
        anyOf: ["hr.departments.read" as Permission],
      },
      {
        label: "Designations",
        href: ROUTES.HR_DESIGNATIONS,
        icon: <IdCard className="h-4 w-4" />,
        anyOf: ["hr.designations.read" as Permission],
      },
      {
        label: "Attendance",
        href: ROUTES.HR_ATTENDANCE,
        icon: <Clock className="h-4 w-4" />,
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
        icon: <CalendarClock className="h-4 w-4" />,
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
        icon: <CalendarDays className="h-4 w-4" />,
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
        icon: <Globe className="h-4 w-4" />,
        anyOf: [
          "hr.holidays.read" as Permission,
          "hr.holidays.manage" as Permission,
          "ess.holidays.read" as Permission,
        ],
      },
      {
        label: "Payroll",
        href: ROUTES.HR_PAYROLL,
        icon: <DollarSign className="h-4 w-4" />,
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
        icon: <BarChart3 className="h-4 w-4" />,
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
        icon: <BarChart3 className="h-4 w-4" />,
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
        icon: <Users className="h-4 w-4" />,
        anyOf: [
          PERMISSIONS_V2.USERS_READ as Permission,
          PERMISSIONS_V2.USERS_CREATE as Permission,
          PERMISSIONS_V2.USERS_UPDATE as Permission,
        ],
      },
      {
        label: "Permissions",
        href: ROUTES.USERS_PERMISSIONS,
        icon: <Shield className="h-4 w-4" />,
        anyOf: [
          PERMISSIONS_V2.USERS_UPDATE_ROLE as Permission,
          PERMISSIONS_V2.USERS_UPDATE as Permission,
        ],
      },
      {
        label: "Stores",
        href: ROUTES.STORES,
        icon: <Store className="h-4 w-4" />,
        anyOf: [
          PERMISSIONS_V2.STORES_CREATE as Permission,
          PERMISSIONS_V2.STORES_UPDATE as Permission,
          PERMISSIONS_V2.STORES_DELETE as Permission,
        ],
      },
      {
        label: "Settings",
        href: ROUTES.SETTINGS,
        icon: <Settings className="h-4 w-4" />,
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
        icon: <ShieldAlert className="h-4 w-4" />,
        exactRole: Role.SUPER_ADMIN,
      },
    ],
  },
];

const MORE_BUTTON_WIDTH = 105;
const ITEM_GAP = 4;

export function Sidebar() {
  const pathname = usePathname();
  const dispatch = useAppDispatch();

  const mobileOpen = useAppSelector((state) => state.uiPrefs.mobileSidebarOpen);

  const user = useAppSelector((state) => state.auth.user);

  const userRole = user?.role ?? Role.CASHIER;
  const isSuperAdmin = userRole === Role.SUPER_ADMIN;

  const desktopContainerRef = useRef<HTMLDivElement>(null);
  const measurementRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const [visibleCount, setVisibleCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    dispatch(setMobileSidebarOpen(false));
    setMoreOpen(false);
  }, [pathname, dispatch]);

  const isItemVisible = useCallback(
    (item: NavItem): boolean => {
      if (item.exactRole) {
        return userRole === item.exactRole;
      }

      if (isSuperAdmin) {
        return true;
      }

      if (item.roles && !item.roles.includes(userRole)) {
        return false;
      }

      if (item.anyOf?.length) {
        return hasAnyPermission(user, ...item.anyOf);
      }

      return true;
    },
    [user, userRole, isSuperAdmin],
  );

  const desktopItems = useMemo<VisibleNavItem[]>(() => {
    return NAV_SECTIONS.flatMap((section) =>
      section.items.filter(isItemVisible).map((item) => ({
        ...item,
        sectionTitle: section.title,
        isSuperAdminSection: section.title === "Super Admin",
      })),
    );
  }, [isItemVisible]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  useLayoutEffect(() => {
    const container = desktopContainerRef.current;
    const measurement = measurementRef.current;

    if (!container || !measurement) {
      return;
    }

    const calculateVisibleItems = () => {
      const availableWidth = container.clientWidth;

      if (!availableWidth) {
        return;
      }

      const itemElements = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-nav-measure]"),
      );

      if (itemElements.length === 0) {
        setVisibleCount(0);
        return;
      }

      const widths = itemElements.map((element) => element.getBoundingClientRect().width);

      const totalWidth =
        widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * ITEM_GAP;

      if (totalWidth <= availableWidth) {
        setVisibleCount(desktopItems.length);
        return;
      }

      const availableForItems = Math.max(0, availableWidth - MORE_BUTTON_WIDTH);

      let usedWidth = 0;
      let count = 0;

      for (let index = 0; index < widths.length; index += 1) {
        const nextWidth = widths[index] + (count > 0 ? ITEM_GAP : 0);

        if (usedWidth + nextWidth > availableForItems) {
          break;
        }

        usedWidth += nextWidth;
        count += 1;
      }

      const activeIndex = desktopItems.findIndex(
        (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
      );

      if (activeIndex >= count && activeIndex >= 0 && count > 0) {
        setVisibleCount(count);
        return;
      }

      setVisibleCount(count);
    };

    calculateVisibleItems();

    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleItems();
    });

    resizeObserver.observe(container);

    window.addEventListener("resize", calculateVisibleItems);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", calculateVisibleItems);
    };
  }, [desktopItems, pathname]);

  const visibleDesktopItems = desktopItems.slice(0, visibleCount);
  const overflowDesktopItems = desktopItems.slice(visibleCount);

  const isMoreActive = overflowDesktopItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <>
      <div
        onClick={() => dispatch(setMobileSidebarOpen(false))}
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden",
          "transition-opacity duration-200",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
      />

      <nav
        className={cn(
          "fixed left-0 right-0 z-40",
          "border-b border-slate-200 bg-white",
          "dark:border-slate-800 dark:bg-slate-900",
        )}
        style={{
          top: "calc(4rem + var(--demo-banner-h, 0px))",
        }}
      >
        <div className="hidden h-14 items-center px-4 lg:flex xl:px-6">
          <div ref={desktopContainerRef} className="relative flex min-w-0 flex-1 items-center">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              {visibleDesktopItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={cn(
                      "group flex h-9 shrink-0 items-center gap-2 rounded-lg px-3",
                      "text-[13px] font-medium transition-colors",
                      active
                        ? item.isSuperAdminSection
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                          : "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                        : item.isSuperAdminSection
                          ? "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 transition-colors",
                        active
                          ? item.isSuperAdminSection
                            ? "text-amber-600 dark:text-amber-300"
                            : "text-primary-600 dark:text-primary-300"
                          : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300",
                      )}
                    >
                      {item.icon}
                    </span>

                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {overflowDesktopItems.length > 0 && (
              <div ref={moreRef} className="relative ml-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setMoreOpen((current) => !current)}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg px-3",
                    "text-[13px] font-medium transition-colors",
                    isMoreActive
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                  )}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                >
                  <MoreHorizontal className="h-4 w-4" />

                  <span>More</span>

                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", moreOpen && "rotate-180")}
                  />
                </button>

                {moreOpen && (
                  <div
                    className={cn(
                      "absolute right-0 top-11 z-50",
                      "max-h-[calc(100vh-10rem)] w-64 overflow-y-auto",
                      "rounded-xl border border-slate-200 bg-white",
                      "p-2 shadow-xl shadow-slate-200/50",
                      "dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30",
                    )}
                    role="menu"
                  >
                    {NAV_SECTIONS.map((section) => {
                      const sectionItems = overflowDesktopItems.filter(
                        (item) => item.sectionTitle === section.title,
                      );

                      if (sectionItems.length === 0) {
                        return null;
                      }

                      const isSuperAdminSection = section.title === "Super Admin";

                      return (
                        <div key={section.title} className="mb-2 last:mb-0">
                          <p
                            className={cn(
                              "px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-wider",
                              isSuperAdminSection
                                ? "text-amber-500"
                                : "text-slate-400 dark:text-slate-500",
                            )}
                          >
                            {section.title}
                          </p>

                          <div className="space-y-0.5">
                            {sectionItems.map((item) => {
                              const active =
                                pathname === item.href || pathname.startsWith(`${item.href}/`);

                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={() => setMoreOpen(false)}
                                  className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5",
                                    "text-sm font-medium transition-colors",
                                    active
                                      ? isSuperAdminSection
                                        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                        : "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                                      : isSuperAdminSection
                                        ? "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
                                  )}
                                  role="menuitem"
                                >
                                  <span className="shrink-0">{item.icon}</span>

                                  <span className="truncate">{item.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div
              ref={measurementRef}
              className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1"
              aria-hidden="true"
            >
              {desktopItems.map((item) => (
                <div
                  key={item.href}
                  data-nav-measure
                  className="flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[13px] font-medium"
                >
                  <span className="shrink-0">{item.icon}</span>

                  <span className="whitespace-nowrap">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "absolute left-0 top-0 lg:hidden",
            "w-[300px] max-w-[85vw]",
            "border-r border-slate-200 bg-white shadow-xl",
            "dark:border-slate-800 dark:bg-slate-900",
            "transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{
            height: "calc(100vh - 4rem - var(--demo-banner-h, 0px))",
          }}
        >
          <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))",
                }}
              >
                Rx
              </span>

              <span className="font-bold text-slate-900 dark:text-white">RX POS</span>
            </div>

            <button
              type="button"
              onClick={() => dispatch(setMobileSidebarOpen(false))}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {isSuperAdmin && (
            <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />

              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Super Admin Mode
              </span>
            </div>
          )}

          <div className="h-[calc(100%-3.5rem)] overflow-y-auto px-3 py-4">
            {NAV_SECTIONS.map((section) => {
              const visibleItems = section.items.filter(isItemVisible);

              if (visibleItems.length === 0) {
                return null;
              }

              const isSuperAdminSection = section.title === "Super Admin";

              return (
                <div key={section.title} className="mb-5">
                  <p
                    className={cn(
                      "mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider",
                      isSuperAdminSection ? "text-amber-500" : "text-slate-400 dark:text-slate-500",
                    )}
                  >
                    {section.title}
                  </p>

                  <div className="space-y-1">
                    {visibleItems.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2.5",
                            "text-sm font-medium transition-colors",
                            active
                              ? isSuperAdminSection
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                                : "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
                              : isSuperAdminSection
                                ? "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10"
                                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white",
                          )}
                        >
                          <span className="shrink-0">{item.icon}</span>

                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
