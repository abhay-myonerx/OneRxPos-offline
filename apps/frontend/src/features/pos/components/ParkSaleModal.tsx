"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";

export interface ParkSaleModalProps {
  open: boolean;
  onClose: () => void;
  /** Park the current cart with an optional label (blank → no label). */
  onPark: (label: string | null) => void;
}

/**
 * Park (suspend) the current sale (Phase 1.3b). Collects an optional short label
 * to identify the hold in the recall list (e.g. "phone-in Jane", "back at 5pm").
 * The heavy lifting — snapshotting, IndexedDB write, backend mirror, cart clear —
 * lives in `useRingUp.doPark`; this modal only gathers the label.
 */
export function ParkSaleModal({ open, onClose, onPark }: ParkSaleModalProps) {
  const [label, setLabel] = useState("");

  const handlePark = () => {
    onPark(label.trim() || null);
    setLabel("");
  };

  const handleClose = () => {
    setLabel("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Park sale"
      description="Suspend this sale to serve another customer. Recall it any time from this store."
      size="sm"
      primaryAction={{ label: "Park sale", onClick: handlePark }}
      secondaryAction={{ label: "Cancel", onClick: handleClose }}
    >
      <div>
        <label
          htmlFor="park-sale-label"
          className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1 block"
        >
          Label <span className="text-slate-400">(optional)</span>
        </label>
        <Input
          id="park-sale-label"
          autoFocus
          aria-label="Label"
          placeholder="e.g. phone-in Jane"
          maxLength={120}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handlePark()}
        />
      </div>
    </Modal>
  );
}
