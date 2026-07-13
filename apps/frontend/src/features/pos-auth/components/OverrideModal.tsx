"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Delete, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Modal } from "@/components/ui/modal";
import { parseApiError } from "@/lib/api/error-handler";
import { useRequestOverrideMutation, getLaneFingerprint } from "../api/pos-auth.api";

const PIN_LENGTH = 6;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export interface OverrideModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * The gated action being requested (e.g. `"VOID_TRANSACTION"`,
   * `"DISCOUNT_OVER_LIMIT"`) — sent as-is to the override endpoint. The
   * gated actions themselves land with their features in 1.3/1.6; 1.1 only
   * provides the override mechanism.
   */
  action: string;
  /** Free-form context for the audit trail (e.g. a transaction id or the requested discount amount). */
  context: string;
  /**
   * The manager/supervisor authorizing this override — picked upstream via
   * a user-select, the same pattern `PinPadLogin` uses for its `userId`.
   */
  authorizerUserId: string;
  /** Called with the signed override grant string once the authorizer's PIN is verified. */
  onGranted: (grant: string) => void;
}

/**
 * Manager-override PIN modal (Phase 1.1, Task 13). Mirrors `PinPadLogin`'s
 * (Task 12) PIN-entry UI and status/code error-branching — 423/PIN_LOCKED
 * lockout, 401 wrong-PIN, else a generic error — but submits to
 * `useRequestOverrideMutation` instead of `usePinLoginMutation`, and on
 * success resolves to a signed override grant (via `onGranted`) rather than
 * a session token. `/override` is exempted from the base-api auth
 * interceptor, so this doesn't disturb the cashier's own session.
 */
export function OverrideModal({
  open,
  onClose,
  action,
  context,
  authorizerUserId,
  onGranted,
}: OverrideModalProps) {
  const { t } = useTranslation("pos");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requestOverride, { isLoading }] = useRequestOverrideMutation();

  const submit = useCallback(
    async (fullPin: string) => {
      setError(null);
      try {
        const deviceFingerprint = await getLaneFingerprint();
        const result = await requestOverride({
          action,
          authorizerUserId,
          pin: fullPin,
          deviceFingerprint,
          context,
        }).unwrap();
        setPin("");
        onGranted(result.grant);
      } catch (err) {
        const parsed = parseApiError(err);
        // Same status/code branching as PinPadLogin — not an English
        // substring match — since the backend returns a distinct
        // 423/PIN_LOCKED for lockout (see pin.service.ts's PinLockedError),
        // 401 for a bad/unknown authorizer credential (override.service.ts's
        // AuthenticationError), and 403 for an authorizer who is a genuine
        // (known, correctly-PIN'd) user but whose role lacks the action's
        // permission (AuthorizationError) — a distinct case from a bad PIN.
        let message: string;
        if (parsed.status === 423 || parsed.code === "PIN_LOCKED") {
          message = t("posAuth.override.lockedOut");
        } else if (parsed.status === 401) {
          message = t("posAuth.override.wrongPin");
        } else if (parsed.status === 403) {
          message = t("posAuth.override.notAuthorized");
        } else {
          // Network error, 500, etc. — not a credentials problem.
          message = t("posAuth.override.genericError");
        }
        setError(message);
        setPin("");
      }
    },
    [requestOverride, action, authorizerUserId, context, onGranted, t],
  );

  // Same double-submit guard as PinPadLogin: compute `next` from the
  // current `pin` in the click handler (not inside a `setPin` functional
  // updater) so React Strict Mode's dev-only double-invoke of updaters
  // can't double-fire `submit`.
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

  const handleClose = () => {
    setPin("");
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("posAuth.override.title")}
      description={t("posAuth.override.subtitle")}
      size="sm"
    >
      <div className="w-full flex flex-col items-center gap-6">
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
    </Modal>
  );
}
