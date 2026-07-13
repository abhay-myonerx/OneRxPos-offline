"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useAppDispatch } from "@/store/hooks";
import { overrideLinePrice } from "@/features/pos/state/cart.slice";
import { priceOverrideCtx } from "@/features/pos/helpers/override-context";
import { useListUsersQuery } from "@/features/users/api/users.api";
import { OverrideModal } from "@/features/pos-auth/components/OverrideModal";
import { formatMoney } from "@/lib/currency/format-money";
import type { CartItem } from "@/features/pos/types/cart.types";

export interface PriceOverrideModalProps {
  /** The cart line whose price is being overridden. */
  line: CartItem;
  open: boolean;
  onClose: () => void;
  /** Called once the price override has been dispatched to the cart. */
  onApplied: () => void;
}

/**
 * Gated line price-override (Phase 1.3a, Task 14). Two steps:
 *
 *  1. Collect the new price + the authorizing manager (this component's own
 *     `Modal`).
 *  2. Hand off to the 1.1 `OverrideModal` (Task 13's PIN pad), bound to
 *     `priceOverrideCtx(line.productId, line.unitPrice, newPrice)` —
 *     `line.unitPrice` here is the line's CURRENT (pre-override) price.
 *
 * On a granted PIN, dispatches `overrideLinePrice` (Task 5's cart reducer),
 * which snapshots the line's pre-override `unitPrice` as
 * `priceOverride.originalPrice` *before* overwriting it with `newPrice` — so
 * that snapshot is exactly the `oldPrice` this component used to request the
 * grant. `useRingUp.handleCheckout` later rebuilds the SAME context from
 * `priceOverride.originalPrice`/the line's (now-overridden) `unitPrice` via
 * the SAME `priceOverrideCtx` builder, so the two context strings the
 * backend hashes (request-time vs. consume-time) are byte-identical — a
 * mismatch would make `consumeOverride`'s sha256(context) check fail closed
 * and reject the checkout (Task 9).
 */
export function PriceOverrideModal({ line, open, onClose, onApplied }: PriceOverrideModalProps) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<"price" | "pin">("price");
  const [priceInput, setPriceInput] = useState("");
  const [authorizerUserId, setAuthorizerUserId] = useState("");

  // Only fetch while the price/authorizer step is actually showing.
  const { data: managersPage } = useListUsersQuery(
    { role: "MANAGER", limit: 25 },
    { skip: !open || step !== "price" },
  );
  const managers = managersPage?.data ?? [];

  const newPrice = parseFloat(priceInput);
  const isValidPrice = priceInput.trim() !== "" && !Number.isNaN(newPrice) && newPrice >= 0;
  const canContinue = isValidPrice && authorizerUserId !== "";

  // Built from the line's CURRENT unitPrice (before this override lands) —
  // see the file header for why this MUST match handleCheckout's rebuild.
  const overrideCtx = useMemo(
    () => priceOverrideCtx(line.productId, line.unitPrice, newPrice),
    [line.productId, line.unitPrice, newPrice],
  );

  const reset = () => {
    setStep("price");
    setPriceInput("");
    setAuthorizerUserId("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGranted = (grant: string) => {
    dispatch(overrideLinePrice({ id: line.id, newPrice, grant, authorizerUserId }));
    reset();
    onApplied();
  };

  if (step === "pin") {
    return (
      <OverrideModal
        open={open}
        onClose={handleClose}
        action={overrideCtx.action}
        context={overrideCtx.context}
        authorizerUserId={authorizerUserId}
        onGranted={handleGranted}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Override Price"
      description={`${line.name} — current price ${formatMoney(line.unitPrice)}`}
      size="sm"
      primaryAction={{
        label: "Continue",
        onClick: () => setStep("pin"),
        disabled: !canContinue,
      }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            New Price
          </label>
          <Input
            type="number"
            min={0}
            step="0.01"
            autoFocus
            aria-label="New price"
            placeholder={String(line.unitPrice)}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="price-override-authorizer"
            className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
          >
            Authorizer
          </label>
          <select
            id="price-override-authorizer"
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
      </div>
    </Modal>
  );
}
