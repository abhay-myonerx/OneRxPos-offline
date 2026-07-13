"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

export interface ManualBarcodeModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called with the trimmed, non-empty barcode text. Callers route this
   * straight through the same `handleBarcodeScan` used by the USB HID and
   * phone/WebSocket scanners (Phase 1.3a, Task 13) so lookup/stock-guard/
   * addToCart all reuse the existing logic — this modal is just an
   * alternate input source for when a physical scan fails.
   */
  onSubmit: (barcode: string) => void;
}

/**
 * Manual barcode entry modal (Phase 1.3a, Task 13). Opened via the
 * `manualBarcode` hotkey (F3) when a scan fails or no scanner is at hand.
 * Mirrors `OverrideModal`'s use of the shared `Modal` primitive, but with a
 * plain text field instead of a PIN pad — no auth involved here.
 */
export function ManualBarcodeModal({ open, onClose, onSubmit }: ManualBarcodeModalProps) {
  const [barcode, setBarcode] = useState("");

  const trimmed = barcode.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit(trimmed);
    setBarcode("");
    onClose();
  };

  const handleClose = () => {
    setBarcode("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Enter Barcode"
      description="Type the barcode manually if the scanner can't read it."
      size="sm"
      primaryAction={{ label: "Add", onClick: handleSubmit, disabled: !trimmed }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <Input
        autoFocus
        placeholder="Scan or type barcode"
        value={barcode}
        onChange={(e) => setBarcode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
    </Modal>
  );
}
