"use client";

import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { TaxCategory } from "rx-pos-shared";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useAppDispatch } from "@/store/hooks";
import { addMiscItem } from "@/features/pos/state/cart.slice";
import { buildMiscCartLine } from "@/features/pos/helpers/misc-item";
import { openPriceItemCtx } from "@/features/pos/helpers/override-context";
import { useListUsersQuery } from "@/features/users/api/users.api";
import { useGetMiscProductQuery } from "@/features/pos/api/pos.api";
import { OverrideModal } from "@/features/pos-auth/components/OverrideModal";
import { TAX_CATEGORY_OPTIONS } from "@/features/products/types/product.types";

export interface ManualItemModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Gated open-price / miscellaneous item entry (Phase 1.3a, Task 15). Two steps:
 *
 *  1. Collect the description, price, tax category, and authorizing manager
 *     (this component's own `Modal`).
 *  2. Hand off to the 1.1 `OverrideModal` (Task 13's PIN pad), bound to
 *     `openPriceItemCtx(price, description)`.
 *
 * On a granted PIN, fetches/uses the tenant's "Miscellaneous" product id
 * (Task 9's `GET /products/misc`, wired here via `pos.api.ts`'s
 * `useGetMiscProductQuery`) and dispatches `addMiscItem(buildMiscCartLine(...))`
 * (Task 3's builder, Task 5's cart reducer). `useRingUp.handleCheckout` later
 * rebuilds the SAME context from the resulting line's `unitPrice`/`name` via
 * the SAME `openPriceItemCtx` builder, so the two context strings the backend
 * hashes (request-time vs. consume-time) are byte-identical — a mismatch
 * would make `consumeOverride`'s sha256(context) check fail closed and reject
 * the checkout (Task 9).
 */
export function ManualItemModal({ open, onClose }: ManualItemModalProps) {
  const dispatch = useAppDispatch();
  const [step, setStep] = useState<"form" | "pin">("form");
  const [description, setDescription] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [taxCategory, setTaxCategory] = useState<TaxCategory>("STANDARD");
  const [authorizerUserId, setAuthorizerUserId] = useState("");
  // Defensive fallback only — set when a PIN grant lands but the misc
  // product is (still) unavailable despite the Continue-button gate below.
  const [miscUnavailableError, setMiscUnavailableError] = useState(false);

  // Only fetch while the form step is actually showing.
  const { data: managersPage } = useListUsersQuery(
    { role: "MANAGER", limit: 25 },
    { skip: !open || step !== "form" },
  );
  const managers = managersPage?.data ?? [];

  // Fetched as soon as the modal opens so the tenant's Misc product id is
  // already in hand by the time the PIN grant lands.
  const {
    data: miscProduct,
    isLoading: isMiscLoading,
    isError: isMiscError,
  } = useGetMiscProductQuery(undefined, { skip: !open });

  const price = parseFloat(priceInput);
  const isValidPrice = priceInput.trim() !== "" && !Number.isNaN(price) && price >= 0;
  // Requiring miscProduct?.id (not just "not loading") is the gate that
  // prevents advancing to the PIN step — and therefore consuming a manager
  // grant — before we actually have somewhere to attach the resulting line.
  // While the query is loading OR has errored, miscProduct is undefined, so
  // this naturally keeps Continue disabled in both cases.
  const canContinue =
    description.trim() !== "" &&
    isValidPrice &&
    authorizerUserId !== "" &&
    !isMiscLoading &&
    !!miscProduct?.id;

  // Built from the entered price/description — see the file header for why
  // this MUST match handleCheckout's rebuild.
  const overrideCtx = useMemo(
    () => openPriceItemCtx(price, description),
    [price, description],
  );

  const reset = () => {
    setStep("form");
    setDescription("");
    setPriceInput("");
    setTaxCategory("STANDARD");
    setAuthorizerUserId("");
    setMiscUnavailableError(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGranted = (grant: string) => {
    // Should be unreachable — Continue is gated on miscProduct?.id — but if
    // the misc product became unavailable between the gate and the grant
    // landing (e.g. a refetch errored out), never dispatch a partial line
    // and never pretend this was a silent success. Fall back to the form
    // step with a visible error instead of closing.
    if (!miscProduct?.id) {
      setStep("form");
      setMiscUnavailableError(true);
      return;
    }

    dispatch(
      addMiscItem(
        buildMiscCartLine({
          miscProductId: miscProduct.id,
          description,
          price,
          taxCategory,
          grant,
          authorizerUserId,
          lineId: `misc-${crypto.randomUUID()}`,
        }),
      ),
    );
    reset();
    onClose();
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
      title="Open-Price / Misc Item"
      description="Enter a description, price, and tax category for an item not in the catalog."
      size="sm"
      primaryAction={{
        label: "Continue",
        onClick: () => setStep("pin"),
        disabled: !canContinue,
      }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <div className="space-y-4">
        {(isMiscError || miscUnavailableError) && (
          <p
            role="alert"
            className="text-sm text-error-600 dark:text-error-400 flex items-center gap-1"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Miscellaneous items are unavailable — try again.
          </p>
        )}

        <div>
          <label
            htmlFor="manual-item-description"
            className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
          >
            Description
          </label>
          <Input
            id="manual-item-description"
            autoFocus
            aria-label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="manual-item-price"
            className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
          >
            Price
          </label>
          <Input
            id="manual-item-price"
            type="number"
            min={0}
            step="0.01"
            aria-label="Price"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="manual-item-tax-category"
            className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
          >
            Tax Category
          </label>
          <select
            id="manual-item-tax-category"
            aria-label="Tax Category"
            value={taxCategory}
            onChange={(e) => setTaxCategory(e.target.value as TaxCategory)}
            className="w-full h-9 px-3 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400"
          >
            {TAX_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="manual-item-authorizer"
            className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
          >
            Authorizer
          </label>
          <select
            id="manual-item-authorizer"
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
