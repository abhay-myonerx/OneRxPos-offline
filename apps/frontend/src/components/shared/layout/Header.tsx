"use client";

import { useState, useRef, useEffect } from "react";
import { useNavigate, usePathname } from "@/shell/nav";
import { LogOut, User, Settings, ChevronDown, ShieldAlert, Building2, Menu } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/auth.slice";
import { toggleMobileSidebar } from "@/features/settings/state/ui-prefs.slice";
import { useLogoutMutation } from "@/features/auth/api/auth.api";
import { ROUTES } from "@/constants/routes";
import { Role } from "@/types/enums/role.enums";
import { hasPermission } from "@/lib/permissions/has-permission";
import { PERMISSIONS_V2 } from "@/lib/permissions/permissions-v2";
import { Badge } from "@/components/ui/badge";
import { GlobalSearch } from "@/components/shared/layout/GlobalSearch";
import { ThemeToggle } from "@/components/shared/theme/ThemeToggle";
import { LocaleSwitcher } from "@/components/shared/i18n/LocaleSwitcher";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { disconnectSocket } from "@/lib/socket/socket-client";

function usePageTitle() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "Dashboard";
  }

  const last = segments[segments.length - 1];
  const isUUID = /^[0-9a-f-]{36}$/i.test(last);

  const label = isUUID && segments.length > 1 ? segments[segments.length - 2] : last;

  return label.replace(/-/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function Header() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector((state) => state.auth.user);
  const tenant = useAppSelector((state) => state.auth.tenant);

  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [logoutApi] = useLogoutMutation();

  const dropRef = useRef<HTMLDivElement>(null);

  const pageTitle = usePageTitle();

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, []);

  const handleLogout = () => {
    disconnectSocket();

    dispatch(logout());

    navigate(ROUTES.LOGIN);

    logoutApi()
      .unwrap()
      .catch(() => {
        // Logout is already completed locally.
      });
  };

  const roleBadgeVariant = (): "default" | "success" | "warning" | "danger" | "info" => {
    switch (user?.role) {
      case Role.SUPER_ADMIN:
        return "danger";

      case Role.ADMIN:
        return "info";

      case Role.MANAGER:
        return "warning";

      default:
        return "default";
    }
  };

  return (
    <header
      className={cn(
        "fixed left-0 right-0 z-50",
        "h-16",
        "border-b border-slate-200",
        "bg-white/95 backdrop-blur-md",
        "dark:border-slate-800 dark:bg-slate-900/95",
      )}
      style={{
        top: "var(--demo-banner-h, 0px)",
      }}
    >
      <div className="flex h-full items-center gap-3 px-4 sm:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => dispatch(toggleMobileSidebar())}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              "text-slate-600 transition-colors",
              "hover:bg-slate-100",
              "dark:text-slate-400 dark:hover:bg-slate-800",
              "lg:hidden",
            )}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="hidden items-center gap-2.5 lg:flex"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-primary-600), var(--color-accent-500))",
              }}
            >
              Rx
            </span>

            <div className="text-left">
              <p className="text-sm font-bold leading-none text-slate-900 dark:text-white">
                RX POS
              </p>

              <p className="mt-1 text-[10px] font-medium text-slate-400">Point of Sale</p>
            </div>
          </button>
        </div>

        <div className="hidden h-7 w-px shrink-0 bg-slate-200 dark:bg-slate-700 lg:block" />

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h2 className="max-w-[160px] truncate text-sm font-semibold text-slate-700 dark:text-slate-200 sm:hidden">
            {pageTitle}
          </h2>

          <div className="hidden min-w-0 flex-1 sm:block">
            <GlobalSearch />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {isSuperAdmin && (
            <div className="hidden items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 sm:flex dark:border-amber-500/20 dark:bg-amber-500/10">
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />

              <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Super Admin
              </span>
            </div>
          )}

          <ThemeToggle />

          <LocaleSwitcher />

          <NotificationBell />

          <div ref={dropRef} className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((current) => !current)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-lg pl-1.5 pr-2",
                "transition-colors hover:bg-slate-100",
                "dark:hover:bg-slate-800",
              )}
              aria-expanded={dropdownOpen}
              aria-haspopup="menu"
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  isSuperAdmin
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    : "bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300",
                )}
              >
                <span className="text-xs font-semibold">
                  {user?.firstName?.[0]?.toUpperCase()}
                  {user?.lastName?.[0]?.toUpperCase()}
                </span>
              </div>

              <div className="hidden max-w-[140px] text-left md:block">
                <p className="truncate text-sm font-medium leading-none text-slate-700 dark:text-slate-200">
                  {user?.firstName}
                </p>

                <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">
                  {user?.role?.replace(/_/g, " ")}
                </p>
              </div>

              <ChevronDown
                className={cn(
                  "hidden h-4 w-4 text-slate-400 transition-transform sm:block",
                  dropdownOpen && "rotate-180",
                )}
              />
            </button>

            {dropdownOpen && (
              <div
                className={cn(
                  "absolute right-0 top-12 z-50 w-64",
                  "rounded-xl border border-slate-200",
                  "bg-white py-2 shadow-lg shadow-slate-200/50",
                  "dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/30",
                  "animate-scale-in",
                )}
                role="menu"
              >
                <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {user?.firstName} {user?.lastName}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {user?.email}
                      </p>
                    </div>

                    <Badge variant={roleBadgeVariant()}>{user?.role?.replace(/_/g, " ")}</Badge>
                  </div>

                  {tenant && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <Building2 className="h-3 w-3 shrink-0" />

                      <span className="truncate">{tenant.name}</span>

                      <span className="shrink-0 text-slate-400">·</span>

                      <span className="shrink-0 text-slate-400">{tenant.plan}</span>
                    </div>
                  )}
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(ROUTES.PROFILE);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    role="menuitem"
                  >
                    <User className="h-4 w-4 text-slate-400" />
                    My Profile
                  </button>

                  {hasPermission(user, PERMISSIONS_V2.TENANT_SETTINGS_UPDATE) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate(ROUTES.SETTINGS);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                      role="menuitem"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      Settings
                    </button>
                  )}

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate(ROUTES.ADMIN_TENANTS);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10"
                      role="menuitem"
                    >
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      Tenant Management
                    </button>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-1 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-danger-600 transition-colors hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/15"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
