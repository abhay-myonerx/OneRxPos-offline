"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/currency/format-money";
import { DenominationGrid } from "./DenominationGrid";
import { countTotal, type DenominationCounts } from "../helpers/denominations";

export interface OpenTillModalProps {
  open: boolean;
  onClose: () => void;
  onOpenTill: (counts: DenominationCounts) => Promise<void>;
  loading?: boolean;
}

/** Open the till by counting the starting float (Phase 1.4). */
export function OpenTillModal({ open, onClose, onOpenTill, loading }: OpenTillModalProps) {
  const [counts, setCounts] = useState<DenominationCounts>({});
  const total = countTotal(counts);

  const submit = async () => {
    try {
      await onOpenTill(counts);
      setCounts({});
      onClose();
    } catch {
      /* error toasted by the caller; keep the modal open to retry */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open till"
      description="Count the cash you're starting the drawer with."
      size="sm"
      primaryAction={{ label: `Open till · ${formatMoney(total)}`, onClick: submit, loading, disabled: loading }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <DenominationGrid counts={counts} onChange={setCounts} />
    </Modal>
  );
}
