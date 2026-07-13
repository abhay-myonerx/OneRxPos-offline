"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useListUsersQuery } from "@/features/users/api/users.api";
import { OverrideModal } from "@/features/pos-auth/components/OverrideModal";
import type { OverrideRequest } from "@/features/pos/helpers/override-context";

export interface OverrideGateModalProps {
  open: boolean;
  ctx: OverrideRequest;
  title: string;
  description?: string;
  onClose: () => void;
  /** Called with the signed grant + the chosen authorizer once the PIN is verified. */
  onGranted: (grant: string, authorizerUserId: string) => void;
}

/**
 * Generic gated-action prompt (Phase 1.3a, Task 16) — reuses the SAME
 * two-step composition `PriceOverrideModal` (Task 14) pioneered: an
 * authorizer-picker step, then the 1.1 `OverrideModal` PIN pad bound to the
 * caller-supplied `action`/`context`. Unlike `PriceOverrideModal`, this
 * component collects no extra input (no new-price field) — it's used for
 * discount-cap-exceeding discounts and line-void/clear-transaction, where
 * the gated value is already known before the modal opens. `useRingUp`
 * exposes the pending gate (`pendingGate`) + a single `onGranted` handler
 * (`handleGateGranted`) that resolves whichever action opened it.
 */
export function OverrideGateModal({
  open,
  ctx,
  title,
  description,
  onClose,
  onGranted,
}: OverrideGateModalProps) {
  const [step, setStep] = useState<"authorizer" | "pin">("authorizer");
  const [authorizerUserId, setAuthorizerUserId] = useState("");

  // Only fetch while the authorizer-picker step is actually showing.
  const { data: managersPage } = useListUsersQuery(
    { role: "MANAGER", limit: 25 },
    { skip: !open || step !== "authorizer" },
  );
  const managers = managersPage?.data ?? [];

  const reset = () => {
    setStep("authorizer");
    setAuthorizerUserId("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGranted = (grant: string) => {
    onGranted(grant, authorizerUserId);
    reset();
  };

  if (step === "pin") {
    return (
      <OverrideModal
        open={open}
        onClose={handleClose}
        action={ctx.action}
        context={ctx.context}
        authorizerUserId={authorizerUserId}
        onGranted={handleGranted}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      size="sm"
      primaryAction={{
        label: "Continue",
        onClick: () => setStep("pin"),
        disabled: authorizerUserId === "",
      }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <div>
        <label
          htmlFor="override-gate-authorizer"
          className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
        >
          Authorizer
        </label>
        <select
          id="override-gate-authorizer"
          aria-label="Authorizer"
          value={authorizerUserId}
          onChange={(e) => setAuthorizerUserId(e.target.value)}
          className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
        >
          <option value="">Select manager</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}
