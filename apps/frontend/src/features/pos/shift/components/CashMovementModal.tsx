"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

export interface CashMovementModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (type: "PAID_IN" | "PAID_OUT", amount: number, reason?: string) => Promise<void>;
}

/** Record petty-cash paid in / paid out during a shift (Phase 1.4). */
export function CashMovementModal({ open, onClose, onSubmit }: CashMovementModalProps) {
  const [type, setType] = useState<"PAID_IN" | "PAID_OUT">("PAID_OUT");
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState("");

  const amount = parseFloat(amountInput);
  const valid = Number.isFinite(amount) && amount > 0;

  const reset = () => {
    setType("PAID_OUT");
    setAmountInput("");
    setReason("");
  };
  const handleClose = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    if (!valid) return;
    try {
      await onSubmit(type, amount, reason.trim() || undefined);
      reset();
      onClose();
    } catch {
      /* toasted by caller */
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Cash in / out"
      description="Record cash added to or removed from the drawer."
      size="sm"
      primaryAction={{ label: "Record", onClick: submit, disabled: !valid }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          {(["PAID_OUT", "PAID_IN"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                type === t
                  ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {t === "PAID_OUT" ? "Paid out" : "Paid in"}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="cm-amount" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            Amount
          </label>
          <Input
            id="cm-amount"
            type="number"
            min={0}
            step="0.01"
            autoFocus
            aria-label="Amount"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cm-reason" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            Reason <span className="text-slate-400">(optional)</span>
          </label>
          <Input
            id="cm-reason"
            aria-label="Reason"
            placeholder="e.g. float to safe"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
