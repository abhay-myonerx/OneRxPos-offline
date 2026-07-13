"use client";

import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/auth.slice";
import { useLogoutMutation } from "@/features/auth/api/auth.api";

export interface SwitchUserButtonProps {
  /** Called right after the session is cleared (e.g. to land on `PinPadLogin`). */
  onSwitchUser?: () => void;
  className?: string;
}

/**
 * "Switch user" control (Phase 1.1, Task 13). Clears the current lane
 * session client-side — tokens + auth state, via the same `logout` action
 * `Header.tsx` dispatches on full sign-out (see `auth.slice.ts`) — and hands
 * control back to `PinPadLogin` so the next cashier can sign in with their
 * own PIN. Unlike a full sign-out, the device itself stays enrolled; only
 * the user's session is cleared.
 *
 * Critically, this ALSO revokes the server-side session the same way
 * `Header.tsx`'s full sign-out does (`useLogoutMutation` → `POST /auth/logout`).
 * The refresh flow in `base-api.ts` is httpOnly-cookie-based and decoupled
 * from Redux: on a 401 it silently re-populates `TokenManager` off whatever
 * refresh cookie the browser still holds. Every enrolled lane's cookie came
 * from a manager's full login at enrollment time, so clearing only Redux
 * here would leave that manager-privileged cookie valid — a background 401
 * could silently refresh the lane back to manager privileges while the UI
 * shows "logged out, PIN required" (residual-privilege escalation). Calling
 * the logout mutation deletes the refresh token server-side and clears the
 * cookie, closing that gap.
 */
export function SwitchUserButton({ onSwitchUser, className }: SwitchUserButtonProps) {
  const { t } = useTranslation("pos");
  const dispatch = useAppDispatch();
  const [logoutApi] = useLogoutMutation();

  const handleSwitchUser = () => {
    // Clear local auth state and hand off to the PIN pad immediately — no
    // waiting for the network so the UI collapses in one frame.
    dispatch(logout());
    onSwitchUser?.();
    // Backend logout (deletes refresh token from DB + clears the httpOnly
    // refresh cookie) is fire-and-forget, mirroring Header.tsx's full
    // sign-out. Tolerant of failure: even if the network call fails, the
    // lane has already been cleared locally.
    logoutApi()
      .unwrap()
      .catch(() => {
        /* cookie is cleared server-side anyway */
      });
  };

  return (
    <button
      type="button"
      onClick={handleSwitchUser}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        "text-slate-600 dark:text-slate-300",
        "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100",
        "transition-colors",
        className,
      )}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {t("posAuth.switchUser.label")}
    </button>
  );
}
