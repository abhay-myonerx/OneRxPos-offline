/* eslint-disable @typescript-eslint/no-explicit-any */
/* Auth hydration mixes strict types with optional API fields during bootstrap. */

"use client";

/**
 * Shell for authenticated app: sidebar, header, route guard, demo banner, auth sync.
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "@/shell/nav";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { hydrateAuth, setCredentials, logout } from "@/store/auth.slice";
import { setThemeMode } from "@/features/settings/state/ui-prefs.slice";
import { Sidebar } from "@/components/shared/layout/Sidebar";
import { Header } from "@/components/shared/layout/Header";
import { RouteGuard } from "@/components/shared/layout/RouteGuard";
import { DemoBanner } from "@/components/shared/DemoBanner";
import { cn } from "@/lib/utils/cn";
import { ROUTES } from "@/constants/routes";
import { useGetMeQuery } from "@/features/auth/api/auth.api";
import { TokenManager } from "@/lib/api/token-manager";
import { useIsClient } from "@/hooks/useIsClient";
import { Role } from "@/types/enums/role.enums";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { user, isHydrated, isAuthenticated } = useAppSelector((s) => s.auth);
  const sidebarOpen = useAppSelector((s) => s.uiPrefs.sidebarOpen);
  const isClient = useIsClient();
  // Apply the server-persisted theme preference once per mount — a later
  // /auth/me refetch must not clobber an in-session theme change.
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
      // Stash language pref where the existing locale machinery can
      // pick it up — without prescribing whether to use it
      // immediately (which would risk fighting a freshly-set
      // next-intl cookie). The settings UI / locale switcher reads
      // this on its next render.

      if (typeof window !== "undefined" && prefs?.languagePreference) {
        try {
          window.localStorage.setItem("rxpos.languagePreference", prefs.languagePreference);
        } catch {
          // Private mode / storage disabled — silently ignore.
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

  // ESS-only roles (EMPLOYEE) hold no dashboard permissions. Send them to
  // their self-service home so they never load the admin shell — including
  // via a direct deep link, not just the `/dashboard` landing. Backend is
  // the source of truth (it 403s the data); this is the UX guard that
  // completes the documented "EMPLOYEE → /me" intent at the shell level.
  const resolvedRole = meData?.user?.role ?? user?.role;
  useEffect(() => {
    if (!isClient || !isHydrated || isMeLoading || isMeFetching) return;
    if (resolvedRole === Role.EMPLOYEE) {
      navigate(ROUTES.ESS_HOME, { replace: true });
    }
  }, [isClient, isHydrated, isMeLoading, isMeFetching, resolvedRole, navigate]);

  if (!isClient || !isHydrated || isMeLoading || isMeFetching) return null;
  // Once hydrated, a logged-out store (e.g. just after Sign out, before the
  // navigate(..., { replace: true }) to /login lands) must render nothing. Without this the
  // stale `meData` cache keeps the guard below falsy and the admin shell
  // flashes for a frame during the logout navigation.
  if (!isAuthenticated) return null;
  if (!meData?.user && !user) return null;
  // Avoid a flash of the admin shell before the redirect above takes effect.
  if (resolvedRole === Role.EMPLOYEE) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DemoBanner />
      <Sidebar />
      <Header />
      <main
        className={cn(
          "min-h-screen transition-sidebar",
          "ml-0",
          sidebarOpen ? "lg:ml-[260px]" : "lg:ml-[72px]",
        )}
        style={{ paddingTop: "calc(4rem + var(--demo-banner-h, 0px))" }}
      >
        <div className="p-4 sm:p-6">
          <RouteGuard>{children}</RouteGuard>
        </div>
      </main>
    </div>
  );
}
