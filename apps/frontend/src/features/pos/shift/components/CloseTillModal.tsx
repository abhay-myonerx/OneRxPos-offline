"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/currency/format-money";
import { DenominationGrid } from "./DenominationGrid";
import { countTotal, type DenominationCounts } from "../helpers/denominations";
import { cashDifference } from "../helpers/reconcile";
import type { TillSession } from "../useTillSession";

export interface CloseTillModalProps {
  open: boolean;
  onClose: () => void;
  session: TillSession;
}

/**
 * Close the till: count the drawer, compare against the expected cash (float +
 * cash sales − change + paid-in − paid-out, from the live summary), and show the
 * over/short before confirming (Phase 1.4). The backend recomputes expected
 * authoritatively at close.
 */
export function CloseTillModal({ open, onClose, session }: CloseTillModalProps) {
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [expected, setExpected] = useState<number | null>(null);

  useEffect(() => {
    if (open && session.shiftId) {
      session
        .fetchSummary({ id: session.shiftId })
        .unwrap()
        .then((s) => setExpected(s.expectedCash))
        .catch(() => setExpected(null));
    }
    if (!open) {
      setCounts({});
      setExpected(null);
    }
  }, [open, session]);

  const counted = countTotal(counts);
  const diff = expected != null ? cashDifference(counted, expected) : null;

  const submit = async () => {
    try {
      await session.close(counts);
      setCounts({});
      onClose();
    } catch {
      /* toasted by caller */
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close till"
      description="Count the drawer to reconcile the shift."
      size="sm"
      primaryAction={{ label: "Close till", onClick: submit, loading: session.closing, disabled: session.closing }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-3">
        <DenominationGrid counts={counts} onChange={setCounts} />

        <dl className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          <div className="flex justify-between px-3 py-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Expected in drawer</dt>
            <dd className="tabular-nums">{expected == null ? "…" : formatMoney(expected)}</dd>
          </div>
          <div className="flex justify-between px-3 py-1.5">
            <dt className="text-slate-500 dark:text-slate-400">Counted</dt>
            <dd className="tabular-nums">{formatMoney(counted)}</dd>
          </div>
          {diff != null && (
            <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800/50">
              <dt className="font-medium">{diff === 0 ? "Balanced" : diff > 0 ? "Over" : "Short"}</dt>
              <dd
                className={`font-semibold tabular-nums ${
                  diff === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : diff > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-danger-600 dark:text-danger-400"
                }`}
              >
                {diff > 0 ? "+" : ""}
                {formatMoney(diff)}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </Modal>
  );
}
