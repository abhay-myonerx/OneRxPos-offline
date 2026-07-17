/* eslint-disable @typescript-eslint/no-explicit-any */

"use client";

import { useEffect, useRef } from "react";
import { useNavigate } from "@/shell/nav";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { hydrateAuth, setCredentials, logout } from "@/store/auth.slice";
import { setThemeMode } from "@/features/settings/state/ui-prefs.slice";
import { Sidebar } from "@/components/shared/layout/Sidebar";
import { Header } from "@/components/shared/layout/Header";
import { RouteGuard } from "@/components/shared/layout/RouteGuard";
import { DemoBanner } from "@/components/shared/DemoBanner";
import { ROUTES } from "@/constants/routes";
import { useGetMeQuery } from "@/features/auth/api/auth.api";
import { TokenManager } from "@/lib/api/token-manager";
import { useIsClient } from "@/hooks/useIsClient";
import { Role } from "@/types/enums/role.enums";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { user, isHydrated, isAuthenticated } = useAppSelector((state) => state.auth);

  const isClient = useIsClient();
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

    if (!meData?.user || !accessToken) {
      return;
    }

    dispatch(
      setCredentials({
        accessToken,
        user: meData.user,
        tenant,
        isDemoMode: meData.isDemoMode ?? false,
      }),
    );

    const preferences = meData.user.preferences;
    const themePreference = preferences?.themePreference;

    if (
      !themeAppliedRef.current &&
      (themePreference === "light" ||
        themePreference === "dark" ||
        themePreference === "system")
    ) {
      themeAppliedRef.current = true;
      dispatch(setThemeMode(themePreference));
    }

    if (typeof window !== "undefined" && preferences?.languagePreference) {
      try {
        window.localStorage.setItem(
          "rxpos.languagePreference",
          preferences.languagePreference,
        );
      } catch {
        // Ignore storage errors.
      }
    }
  }, [meData, dispatch]);

  useEffect(() => {
    if (!isClient || !isHydrated || isMeLoading || isMeFetching) {
      return;
    }

    if (isMeError) {
      dispatch(logout());
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [
    isClient,
    isHydrated,
    isMeLoading,
    isMeFetching,
    isMeError,
    dispatch,
    navigate,
  ]);

  const resolvedRole = meData?.user?.role ?? user?.role;

  useEffect(() => {
    if (!isClient || !isHydrated || isMeLoading || isMeFetching) {
      return;
    }

    if (resolvedRole === Role.EMPLOYEE) {
      navigate(ROUTES.ESS_HOME, { replace: true });
    }
  }, [
    isClient,
    isHydrated,
    isMeLoading,
    isMeFetching,
    resolvedRole,
    navigate,
  ]);

  if (!isClient || !isHydrated || isMeLoading || isMeFetching) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!meData?.user && !user) {
    return null;
  }

  if (resolvedRole === Role.EMPLOYEE) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <DemoBanner />

      <Header />

      <Sidebar />

      <main
        className="min-h-screen"
        style={{
          paddingTop: "calc(7.5rem + var(--demo-banner-h, 0px))",
        }}
      >
        <div className="p-4 sm:p-6">
          <RouteGuard>{children}</RouteGuard>
        </div>
      </main>
    </div>
  );
}