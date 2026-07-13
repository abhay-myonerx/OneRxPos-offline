"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, User, Trash2, AlertTriangle, Cloud, HardDrive } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatMoney } from "@/lib/currency/format-money";
import type { ParkedSaleRecord } from "@/features/pos/types/parked-sale.types";

export interface RecallSalesModalProps {
  open: boolean;
  onClose: () => void;
  records: ParkedSaleRecord[];
  loading?: boolean;
  onResume: (record: ParkedSaleRecord) => void;
  onDiscard: (record: ParkedSaleRecord) => void;
  /** When true, resuming will first park the current cart (shown to the cashier — B8). */
  activeCartNonEmpty?: boolean;
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Recall a parked sale (Phase 1.3b). A keyboard-navigable list of the store's
 * holds (local ∪ backend, deduped by `useRingUp`): ↑/↓ move, Enter resumes the
 * highlighted hold, 1-9 quick-pick by position. Each row shows label/customer,
 * item count, total, age, parker, and whether it's device-local or synced.
 */
export function RecallSalesModal({
  open,
  onClose,
  records = [],
  loading,
  onResume,
  onDiscard,
  activeCartNonEmpty,
}: RecallSalesModalProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Clamp the selection whenever the list shrinks/changes.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, records.length - 1)));
  }, [records.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (records.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, records.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onResume(records[selected]);
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (idx < records.length) {
        e.preventDefault();
        onResume(records[idx]);
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recall parked sale"
      description="Resume a suspended sale. Arrow keys to move, Enter to resume, 1-9 to quick-pick."
      size="md"
    >
      <div ref={listRef} tabIndex={-1} onKeyDown={onKeyDown} className="outline-none">
        {activeCartNonEmpty && records.length > 0 && (
          <p className="mb-3 flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Resuming will park your current sale first.
          </p>
        )}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Loading…</p>
        ) : records.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            No parked sales at this store.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[min(60vh,420px)] overflow-y-auto pr-0.5">
            {records.map((r, i) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                aria-selected={i === selected}
                onMouseEnter={() => setSelected(i)}
                onClick={() => onResume(r)}
                className={[
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                  i === selected
                    ? "border-primary-400 bg-primary-50 dark:bg-primary-400/15"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50",
                ].join(" ")}
              >
                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 w-4 shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {r.label || "(no label)"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>{r.itemCount} item{r.itemCount === 1 ? "" : "s"}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="h-3 w-3" /> {relativeAge(r.parkedAt)}
                    </span>
                    {r.parkedByName && (
                      <span className="inline-flex items-center gap-0.5 truncate">
                        <User className="h-3 w-3" /> {r.parkedByName}
                      </span>
                    )}
                    <span
                      className="inline-flex items-center gap-0.5"
                      title={r.origin === "remote" ? "Synced (recallable at any till)" : "On this device only"}
                    >
                      {r.origin === "remote" ? (
                        <Cloud className="h-3 w-3" />
                      ) : (
                        <HardDrive className="h-3 w-3" />
                      )}
                    </span>
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                  {formatMoney(r.total)}
                </span>
                <button
                  aria-label="Discard parked sale"
                  title="Discard"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDiscard(r);
                  }}
                  className="shrink-0 text-slate-400 hover:text-danger-500 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
