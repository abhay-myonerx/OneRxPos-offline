"use client";

import { useEffect } from "react";
import { usePathname, useNavigate } from "@/shell/nav";
import { useAppSelector } from "@/store/hooks";
import { ROUTES } from "@/constants/routes";

/**
 * RX POS startup route guard.
 *
 * Cloud authentication / activation is now the first-run entry flow.
 *
 * IMPORTANT:
 *
 * The local Store Node setup state must NOT decide whether the user sees
 * the Business Register screen.
 *
 * RXAdmin is the authority for:
 *
 *   - account login
 *   - account active/inactive status
 *   - initial POS activation approval
 *
 * The local POS remains responsible for:
 *
 *   - offline data
 *   - local Store Node
 *   - SQLite / SQLCipher
 *   - POS business logic
 *   - local authentication after activation
 *
 * Fresh installation:
 *
 *   RX POS
 *     -> /login
 *     -> RXAdmin verification
 *     -> one-time activation
 *     -> local POS
 *
 * Existing activated installation:
 *
 *   RX POS
 *     -> existing local/offline POS flow
 *
 * /setup and /register are no longer public first-run routes.
 */
export function SetupGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const navigate = useNavigate();

  const isAuthenticated = useAppSelector(
    (state) => state.auth.isAuthenticated,
  );

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    /**
     * The old local Business Register flow must not be shown.
     *
     * A user opening either old first-run route is redirected to the
     * RXAdmin-backed login flow.
     */
    if (
      pathname === ROUTES.SETUP ||
      pathname === ROUTES.REGISTER
    ) {
      navigate(ROUTES.LOGIN, {
        replace: true,
      });
    }
  }, [
    pathname,
    navigate,
    isAuthenticated,
  ]);

  return <>{children}</>;
}