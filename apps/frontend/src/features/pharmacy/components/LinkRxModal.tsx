"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { useListBarcodeTemplatesQuery } from "@/features/pos/barcode/barcode.api";
import { decodeBarcode } from "@/features/pos/barcode/decode";

export interface LinkRxModalProps {
  open: boolean;
  onClose: () => void;
  /** Link the prescription to the targeted line. */
  onLink: (rxNumber: string, copay?: number) => void;
  /** The product name being dispensed, for context. */
  productName?: string;
}

/**
 * Link a prescription to a prescription-only line (Phase 2.2). PII-free — the
 * till captures only the Rx number + copay. Scan the Rx barcode (decoded via the
 * 1.3c learned templates) into the field, or type the Rx number manually.
 */
export function LinkRxModal({ open, onClose, onLink, productName }: LinkRxModalProps) {
  const { data: templates } = useListBarcodeTemplatesQuery();
  const [rxNumber, setRxNumber] = useState("");
  const [copayInput, setCopayInput] = useState("");

  const reset = () => {
    setRxNumber("");
    setCopayInput("");
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  // A scanned Rx label is a structured barcode — decode it to pull the Rx# +
  // copay; a hand-typed Rx number decodes to `unknown`/`product` and is kept
  // verbatim.
  const decodeScanned = (raw: string) => {
    const r = decodeBarcode(raw, { templates: templates ?? [] });
    if (r.kind === "rx") {
      if (r.fields.rxNumber) setRxNumber(r.fields.rxNumber);
      if (r.fields.price != null) setCopayInput(String(r.fields.price));
    }
  };

  const copay = parseFloat(copayInput);
  const valid = rxNumber.trim().length > 0;

  const link = () => {
    if (!valid) return;
    onLink(rxNumber.trim(), Number.isFinite(copay) ? copay : undefined);
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Link prescription"
      description={productName ? `Prescription for ${productName}.` : "Scan or enter the prescription."}
      size="sm"
      primaryAction={{ label: "Link Rx", onClick: link, disabled: !valid }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="rx-number" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            Rx number <span className="text-slate-400">(scan the label or type)</span>
          </label>
          <Input
            id="rx-number"
            autoFocus
            aria-label="Rx number"
            value={rxNumber}
            onChange={(e) => setRxNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                decodeScanned(rxNumber);
              }
            }}
          />
          <p className="mt-1 text-[11px] text-slate-400">No patient data is captured — Rx number + amount only.</p>
        </div>
        <div>
          <label htmlFor="rx-copay" className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block">
            Copay amount
          </label>
          <Input
            id="rx-copay"
            type="number"
            min={0}
            step="0.01"
            aria-label="Copay amount"
            value={copayInput}
            onChange={(e) => setCopayInput(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
