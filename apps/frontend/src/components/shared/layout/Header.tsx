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
  if (segments.length === 0) return "Dashboard";
  const last = segments[segments.length - 1];
  const isUUID = /^[0-9a-f-]{36}$/i.test(last);
  const label = isUUID && segments.length > 1 ? segments[segments.length - 2] : last;
  return label.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Header() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const tenant = useAppSelector((s) => s.auth.tenant);
  const sidebarOpen = useAppSelector((s) => s.uiPrefs.sidebarOpen);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoutApi] = useLogoutMutation();
  const dropRef = useRef<HTMLDivElement>(null);
  const pageTitle = usePageTitle();
  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    // Tear down the realtime socket so a subsequent login authenticates fresh
    // (the singleton otherwise stays connected with the previous user's token).
    disconnectSocket();
    // Clear local auth state and navigate immediately — no waiting for the
    // network so the UI collapses to the login page in one frame.
    dispatch(logout());
    navigate(ROUTES.LOGIN);
    // Backend logout (deletes refresh token from DB + clears cookie) is
    // fire-and-forget. The user is already gone from the UI by the time
    // this resolves. resetApiState is intentionally NOT called here — see
    // the comment in the login page for the full explanation.
    logoutApi()
      .unwrap()
      .catch(() => {
        /* cookie is cleared server-side anyway */
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
        "fixed right-0 left-0 h-[60px] bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-30 flex items-center justify-between px-4 sm:px-6 transition-sidebar",
        sidebarOpen ? "lg:left-[256px]" : "lg:left-[72px]",
      )}
      style={{ top: "var(--demo-banner-h, 0px)" }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={() => dispatch(toggleMobileSidebar())}
          className="lg:hidden h-10 w-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate sm:hidden">
          {pageTitle}
        </h2>
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-2">
        {isSuperAdmin && (
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-[11px] font-medium text-amber-700">Super Admin</span>
          </div>
        )}

        <ThemeToggle />

        <LocaleSwitcher />

        <NotificationBell />

        <div ref={dropRef} className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 h-10 pl-2 pr-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                isSuperAdmin ? "bg-amber-50 text-amber-700" : "bg-primary-50 text-primary-700",
              )}
            >
              <span className="text-xs font-medium">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-none">
                {user?.firstName}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {user?.role?.replace("_", " ")}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform",
                dropdownOpen && "rotate-180",
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-12 w-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-black/30 py-2 animate-scale-in">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {user?.email}
                    </p>
                  </div>
                  <Badge variant={roleBadgeVariant()}>{user?.role?.replace("_", " ")}</Badge>
                </div>
                {tenant && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 dark:text-slate-400">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{tenant.name}</span>
                    <span className="shrink-0 text-slate-400">·</span>
                    <span className="shrink-0 text-slate-400">{tenant.plan}</span>
                  </div>
                )}
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    navigate(ROUTES.PROFILE);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                >
                  <User className="h-4 w-4 text-slate-400" /> My Profile
                </button>
                {hasPermission(user, PERMISSIONS_V2.TENANT_SETTINGS_UPDATE) && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(ROUTES.SETTINGS);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Settings className="h-4 w-4 text-slate-400" /> Settings
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate(ROUTES.ADMIN_TENANTS);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-amber-700 hover:bg-amber-50 transition-colors"
                  >
                    <ShieldAlert className="h-4 w-4 text-amber-500" /> Tenant Management
                  </button>
                )}
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-500/15 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
