/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";
import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, usePathname } from "@/shell/nav";
import {
  LayoutDashboard,
  User,
  Clock,
  CalendarDays,
  Palmtree,
  Receipt,
  Calendar,
  FileText,
  LogOut,
} from "lucide-react";

import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { hydrateAuth, setCredentials, logout } from "@/store/auth.slice";
import { setThemeMode } from "@/features/settings/state/ui-prefs.slice";
import { useGetMeQuery, useLogoutMutation } from "@/features/auth/api/auth.api";
import { TokenManager } from "@/lib/api/token-manager";
import { useIsClient } from "@/hooks/useIsClient";
import { ROUTES } from "@/constants/routes";
import { DemoBanner } from "@/components/shared/DemoBanner";
import { EssMobileNav } from "@/features/ess/components/EssMobileNav";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { disconnectSocket } from "@/lib/socket/socket-client";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: ROUTES.ESS_HOME, label: "Dashboard", icon: LayoutDashboard },
  { href: ROUTES.ESS_PROFILE, label: "Profile", icon: User },
  { href: ROUTES.ESS_ATTENDANCE, label: "Attendance", icon: Clock },
  { href: ROUTES.ESS_SHIFTS, label: "Shifts", icon: CalendarDays },
  { href: ROUTES.ESS_LEAVE, label: "Leave", icon: Palmtree },
  { href: ROUTES.ESS_PAYSLIPS, label: "Payslips", icon: Receipt },
  { href: ROUTES.ESS_HOLIDAYS, label: "Holidays", icon: Calendar },
  { href: ROUTES.ESS_DOCUMENTS, label: "Documents", icon: FileText },
];

// Live attendance timer — shows only when CHECKED_IN or ON_BREAK
function LiveTimer({
  state,
  events,
}: {
  state: string;
  events?: Array<{ eventType: string; occurredAt: string }>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state === "CHECKED_IN" || state === "ON_BREAK") {
      intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state]);

  const { workedMs } = (() => {
    if (!events) return { workedMs: 0 };
    let worked = 0,
      brk = 0,
      openIn: number | null = null,
      openBreak: number | null = null;
    for (const e of events) {
      const t = new Date(e.occurredAt).getTime();
      if (e.eventType === "CHECK_IN") openIn = t;
      else if (e.eventType === "CHECK_OUT" && openIn != null) {
        worked += t - openIn;
        openIn = null;
      } else if (e.eventType === "BREAK_START") openBreak = t;
      else if (e.eventType === "BREAK_END" && openBreak != null) {
        brk += t - openBreak;
        openBreak = null;
      }
    }
    if (openBreak != null) brk += now - openBreak;
    if (openIn != null) worked += now - openIn;
    return { workedMs: Math.max(0, worked - brk) };
  })();

  function formatHMS(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = s % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
  }

  if (state !== "CHECKED_IN" && state !== "ON_BREAK") return null;

  const isBreak = state === "ON_BREAK";

  return (
    <div
      className={cn(
        "hidden sm:flex items-center gap-2 rounded-full px-3 py-1 border",
        isBreak
          ? "bg-warning-50 dark:bg-warning-500/15 border-warning-200 dark:border-warning-500/30"
          : "bg-success-50 dark:bg-success-500/15 border-success-200 dark:border-success-500/30",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full animate-pulse",
          isBreak ? "bg-warning-500" : "bg-success-500",
        )}
      />
      <span
        className={cn(
          "font-mono text-sm font-semibold tabular-nums",
          isBreak
            ? "text-warning-700 dark:text-warning-300"
            : "text-success-700 dark:text-success-300",
        )}
      >
        {formatHMS(workedMs)}
      </span>
    </div>
  );
}

export default function EssLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = usePathname();
  const dispatch = useAppDispatch();

  const { user, isHydrated, isAuthenticated } = useAppSelector((s) => s.auth);
  const isClient = useIsClient();
  // Apply the server-persisted theme preference once per mount.
  const themeAppliedRef = useRef(false);

  useEffect(() => {
    if (isClient) {
      dispatch(hydrateAuth());
    }
  }, [dispatch, isClient]);

  const {
    data: meData,
    isLoading: isMeLoading,
    isFetching: isMeFetching,
    isError: isMeError,
  } = useGetMeQuery(undefined, {
    skip: !isClient || !isHydrated,
  });

  useEffect(() => {
    const accessToken = TokenManager.getAccessToken();
    const tenant = TokenManager.getTenant() as any;

    if (meData?.user && accessToken) {
      dispatch(
        setCredentials({
          accessToken,
          user: meData.user,
          tenant,
          isDemoMode: meData.isDemoMode ?? false,
        }),
      );

      const prefs = meData.user.preferences;
      const themePref = prefs?.themePreference;
      if (
        !themeAppliedRef.current &&
        (themePref === "light" || themePref === "dark" || themePref === "system")
      ) {
        themeAppliedRef.current = true;
        dispatch(setThemeMode(themePref));
      }
      if (typeof window !== "undefined" && prefs?.languagePreference) {
        try {
          window.localStorage.setItem("rxpos.languagePreference", prefs.languagePreference);
        } catch {
          // Private mode — ignore.
        }
      }
    }
  }, [meData, dispatch]);

  useEffect(() => {
    if (!isClient || !isHydrated || isMeLoading || isMeFetching) return;

    if (isMeError) {
      dispatch(logout());
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [isClient, isHydrated, isMeLoading, isMeFetching, isMeError, dispatch, navigate]);

  const [logoutApi] = useLogoutMutation();

  async function handleLogout() {
    // Tear down the realtime socket so a subsequent login authenticates fresh.
    disconnectSocket();
    try {
      await logoutApi().unwrap();
    } catch {
      // best-effort; clear local state anyway
    }
    dispatch(logout());
    navigate(ROUTES.LOGIN, { replace: true });
  }

  if (!isClient || !isHydrated || isMeLoading || isMeFetching) return null;
  // Once hydrated, a logged-out store (just after Sign out, before the
  // navigate(..., { replace: true }) to /login lands) must render nothing — otherwise the
  // stale `meData` cache keeps the guard below falsy and the ESS chrome /
  // permission-denied content flashes for a frame during logout navigation.
  if (!isAuthenticated) return null;
  if (!meData?.user && !user) return null;

  const firstName = user?.firstName ?? meData?.user?.firstName ?? "";
  const lastName = user?.lastName ?? meData?.user?.lastName ?? "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const initials = `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "ME";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <DemoBanner />
      <header
        className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm"
        style={{ paddingTop: "var(--demo-banner-h, 0px)" }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Left: logo + nav */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={ROUTES.ESS_HOME}
              className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 flex-shrink-0"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#4263eb] text-white text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                ME
              </span>
              <span className="hidden sm:inline text-sm font-semibold text-slate-800 dark:text-slate-100">
                My Workspace
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-0.5 ml-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== ROUTES.ESS_HOME && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-150",
                      active
                        ? "bg-primary-50 dark:bg-primary-400/15 text-[#4263eb] dark:text-primary-300 font-medium"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: live timer + avatar + sign out */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live attendance timer — rendered client-side only */}
            {isClient && <LiveTimer state={"NOT_STARTED"} events={[]} />}

            {/* Real-time notifications */}
            <NotificationBell />

            {/* Avatar + name */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary-100 dark:bg-primary-400/15 text-primary-700 dark:text-primary-300 font-semibold text-xs flex items-center justify-center flex-shrink-0">
                {initials}
              </div>
              <span className="hidden sm:inline text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                {displayName.trim()}
              </span>
            </div>

            {/* Sign out */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors duration-150"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 pb-24 md:pb-6 pt-4">{children}</main>
      <EssMobileNav items={NAV_ITEMS} />
    </div>
  );
}
