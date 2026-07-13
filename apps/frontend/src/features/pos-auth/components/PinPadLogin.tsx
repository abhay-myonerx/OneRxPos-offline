"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Delete, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAppDispatch } from "@/store/hooks";
import { setCredentials } from "@/store/auth.slice";
import { parseApiError } from "@/lib/api/error-handler";
import { usePinLoginMutation, getLaneFingerprint } from "../api/pos-auth.api";

const PIN_LENGTH = 6;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export interface PinPadLoginProps {
  /** The employee attempting to sign in on this lane (picked upstream via a user-select). */
  userId: string;
  /** Called after a successful PIN login + `setCredentials` dispatch (e.g. to navigate to the POS). */
  onSuccess?: () => void;
}

/**
 * 6-digit PIN pad for fast cashier/lane login (Phase 1.1, Task 12).
 * Auto-submits once 6 digits are entered — resolves this lane's device
 * fingerprint, calls `pinLogin`, and on success stores the access token via
 * `setCredentials`. The PIN-login response carries only tokens (no
 * user/tenant payload), so `user`/`tenant` are set to `null` here; the
 * dashboard shell's existing `/auth/me` verification (see the full login
 * page) fills them in on first navigation, exactly as it already does for
 * hydrated-but-unverified sessions.
 */
export function PinPadLogin({ userId, onSuccess }: PinPadLoginProps) {
  const { t } = useTranslation("pos");
  const dispatch = useAppDispatch();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pinLogin, { isLoading }] = usePinLoginMutation();

  const submit = useCallback(
    async (fullPin: string) => {
      setError(null);
      try {
        const deviceFingerprint = await getLaneFingerprint();
        const result = await pinLogin({ deviceFingerprint, userId, pin: fullPin }).unwrap();
        dispatch(
          setCredentials({
            accessToken: result.accessToken,
            user: null,
            tenant: null,
          }),
        );
        setPin("");
        onSuccess?.();
      } catch (err) {
        const parsed = parseApiError(err);
        // Branch on STATUS/CODE, not an English substring match — the
        // backend returns a distinct 423/PIN_LOCKED for lockout (see
        // pin.service.ts's PinLockedError) so this no longer needs to
        // pattern-match the word "locked" in the message.
        let message: string;
        if (parsed.status === 423 || parsed.code === "PIN_LOCKED") {
          message = t("posAuth.pinPad.lockedOut");
        } else if (parsed.status === 401 && /device is not enrolled/i.test(parsed.message)) {
          // Device-not-enrolled shares the generic 401/AUTHENTICATION_ERROR
          // shape with wrong-PIN (see pin.service.ts's runPinLogin) — the
          // message is the only distinguishing signal the backend gives us.
          message = t("posAuth.pinPad.deviceNotEnrolled");
        } else if (parsed.status === 401) {
          message = t("posAuth.pinPad.wrongPin");
        } else {
          // Network error, 500, etc. — not a credentials problem.
          message = t("posAuth.pinPad.genericError");
        }
        setError(message);
        setPin("");
      }
    },
    [pinLogin, userId, dispatch, onSuccess, t],
  );

  // Auto-submit once 6 digits are entered. Deliberately NOT called from
  // inside a `setPin` functional updater: React (Strict Mode, dev only)
  // invokes updater functions twice to surface impurities, which would
  // double-fire `submit` (and double-increment the lockout counter) if the
  // call lived there. Computing `next` from the current `pin` in the click
  // handler itself and submitting after `setPin` guarantees exactly one
  // submit per completed 6-digit entry.
  const handleDigit = (digit: string) => {
    if (isLoading || pin.length >= PIN_LENGTH) return;
    setError(null);
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      void submit(next);
    }
  };

  const handleBackspace = () => {
    if (isLoading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div className="w-full max-w-xs mx-auto flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {t("posAuth.pinPad.title")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t("posAuth.pinPad.subtitle")}
        </p>
      </div>

      {/* Masked entry indicator — dots only, never the digits themselves. */}
      <div className="flex items-center gap-3" aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-3.5 w-3.5 rounded-full border transition-colors",
              i < pin.length
                ? "bg-primary-600 border-primary-600"
                : "bg-transparent border-slate-300 dark:border-slate-600",
            )}
          />
        ))}
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400 ml-1" />}
      </div>

      {error && (
        <p role="alert" className="text-sm text-error-600 dark:text-error-400 text-center">
          <AlertCircle className="inline h-4 w-4 mr-1 -mt-0.5" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={isLoading}
            onClick={() => handleDigit(digit)}
            className={cn(
              "h-14 w-14 rounded-xl text-lg font-semibold",
              "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700",
              "text-slate-800 dark:text-slate-100",
              "hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600",
              "active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {digit}
          </button>
        ))}

        <div aria-hidden="true" />

        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleDigit("0")}
          className={cn(
            "h-14 w-14 rounded-xl text-lg font-semibold",
            "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700",
            "text-slate-800 dark:text-slate-100",
            "hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600",
            "active:scale-[0.97] transition-all disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          0
        </button>

        <button
          type="button"
          disabled={isLoading || pin.length === 0}
          onClick={handleBackspace}
          aria-label={t("posAuth.pinPad.backspace")}
          className={cn(
            "h-14 w-14 rounded-xl flex items-center justify-center",
            "bg-transparent border border-transparent",
            "text-slate-500 dark:text-slate-400",
            "hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200",
            "active:scale-[0.97] transition-all disabled:opacity-30 disabled:cursor-not-allowed",
          )}
        >
          <Delete className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
