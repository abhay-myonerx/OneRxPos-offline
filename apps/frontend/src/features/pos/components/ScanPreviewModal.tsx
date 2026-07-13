"use client";

import { Pill, ScanLine } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/currency/format-money";
import type { ScanPreview } from "@/features/pos/hooks/useRingUp";

export interface ScanPreviewModalProps {
  preview: ScanPreview | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirm preview for a priced scan (Phase 1.3c, §6.8 safety gate). Shown when a
 * GS1 embedded-price barcode or an Rx label is decoded — the cashier sees the
 * Rx#/patient/price (or item/price/weight) and confirms before it rings, so a
 * mis-decoded amount is never added silently. Plain product scans skip this.
 */
export function ScanPreviewModal({ preview, onConfirm, onCancel }: ScanPreviewModalProps) {
  if (!preview) return null;
  const isRx = preview.kind === "rx";

  return (
    <Modal
      open
      onClose={onCancel}
      title={isRx ? "Prescription scanned" : "Scanned item"}
      description="Confirm the details before adding this line."
      size="sm"
      primaryAction={{ label: "Add to cart", onClick: onConfirm }}
      secondaryAction={{ label: "Cancel", onClick: onCancel }}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          {isRx ? (
            <Pill className="h-5 w-5 text-primary-600 shrink-0" />
          ) : (
            <ScanLine className="h-5 w-5 text-primary-600 shrink-0" />
          )}
          <span className="text-sm font-medium truncate">{preview.title}</span>
        </div>

        <dl className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {isRx && preview.rxNumber && (
            <div className="flex justify-between px-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400">Rx number</dt>
              <dd className="font-medium tabular-nums">{preview.rxNumber}</dd>
            </div>
          )}
          {isRx && preview.patient && (
            <div className="flex justify-between px-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400">Patient</dt>
              <dd className="font-medium">{preview.patient}</dd>
            </div>
          )}
          {!isRx && preview.weightKg != null && (
            <div className="flex justify-between px-3 py-2">
              <dt className="text-slate-500 dark:text-slate-400">Weight</dt>
              <dd className="font-medium tabular-nums">{preview.weightKg} kg</dd>
            </div>
          )}
          <div className="flex justify-between px-3 py-2.5 bg-primary-50 dark:bg-primary-400/15">
            <dt className="font-medium text-primary-700 dark:text-primary-300">Price</dt>
            <dd className="text-lg font-semibold tabular-nums text-primary-800 dark:text-primary-200">
              {formatMoney(preview.price)}
            </dd>
          </div>
        </dl>
      </div>
    </Modal>
  );
}
