"use client";

import { Modal } from "@/components/ui/modal";
import type { ActiveCartMirror } from "@/features/pos/persistence/parked-sale-store";

export interface RecoverSaleBannerProps {
  mirror: ActiveCartMirror | null;
  onRecover: () => void;
  onDiscard: () => void;
}

/**
 * Crash-recovery prompt (Phase 1.3b, TranSaf — B4). Shown on POS boot when a
 * non-empty in-progress (un-parked) cart was mirrored to IndexedDB before a
 * refresh/crash. Recovering restores the cart; any manager-authorized prices
 * come back flagged for re-approval (grants are never persisted).
 */
export function RecoverSaleBanner({ mirror, onRecover, onDiscard }: RecoverSaleBannerProps) {
  if (!mirror) return null;

  const itemCount = mirror.snapshot.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <Modal
      open
      onClose={onDiscard}
      title="Recover in-progress sale?"
      description="A sale was interrupted before it was completed or parked."
      size="sm"
      primaryAction={{ label: "Recover sale", onClick: onRecover }}
      secondaryAction={{ label: "Discard", onClick: onDiscard }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {itemCount} item{itemCount === 1 ? "" : "s"} were in the cart. Recover to continue where you
        left off, or discard to start fresh.
      </p>
    </Modal>
  );
}
