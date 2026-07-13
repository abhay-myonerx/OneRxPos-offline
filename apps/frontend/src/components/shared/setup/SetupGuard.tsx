"use client";

import { useEffect } from "react";
import { usePathname, useNavigate } from "@/shell/nav";
import { useAppSelector } from "@/store/hooks";
import { useGetSetupStatusQuery } from "@/features/setup/api/setup.api";
import { ROUTES } from "@/constants/routes";
import { getCachedSetupStatus, setCachedSetupStatus } from "./setup-cache";

/**
 * Reads /setup/status once on first non-authenticated load and routes:
 *   - setupRequired === true  -> redirect everything to /setup
 *   - setupRequired === false -> redirect /setup and /register to /login
 *
 * Fail-open: if the request errors, no redirect happens. The check is also
 * skipped for authenticated users (they're already past setup by definition),
 * so logged-in users never pay the network cost.
 */
export function SetupGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  const cached = getCachedSetupStatus();

  const { data } = useGetSetupStatusQuery(undefined, {
    skip: cached !== null || isAuthenticated,
  });

  useEffect(() => {
    if (data) setCachedSetupStatus(data);
  }, [data]);

  const status = cached ?? data ?? null;

  useEffect(() => {
    if (isAuthenticated) return;
    if (!status) return;

    if (status.setupRequired) {
      if (pathname !== ROUTES.SETUP) {
        navigate(ROUTES.SETUP, { replace: true });
      }
    } else {
      if (pathname === ROUTES.SETUP || pathname === ROUTES.REGISTER) {
        navigate(ROUTES.LOGIN, { replace: true });
      }
    }
  }, [status, pathname, navigate, isAuthenticated]);

  return <>{children}</>;
}
