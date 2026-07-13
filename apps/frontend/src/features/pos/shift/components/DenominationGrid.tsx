"use client";

import { formatMoney } from "@/lib/currency/format-money";
import { CAD_DENOMINATIONS, countTotal, type DenominationCounts } from "../helpers/denominations";

export interface DenominationGridProps {
  counts: DenominationCounts;
  onChange: (counts: DenominationCounts) => void;
}

/**
 * Per-denomination count entry (Phase 1.4), shared by open + close. Each CAD
 * bill/coin gets a count input; the running total is summed as you type.
 */
export function DenominationGrid({ counts, onChange }: DenominationGridProps) {
  const set = (key: string, raw: string) => {
    const n = parseInt(raw, 10);
    onChange({ ...counts, [key]: Number.isFinite(n) && n > 0 ? n : 0 });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {CAD_DENOMINATIONS.map((d) => {
          const n = counts[d.key] || 0;
          return (
            <div key={d.key} className="flex items-center gap-2">
              <span className="w-12 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {d.label}
              </span>
              <span className="text-slate-400">×</span>
              <input
                type="number"
                min={0}
                aria-label={`${d.label} count`}
                value={n === 0 ? "" : n}
                onChange={(e) => set(d.key, e.target.value)}
                className="w-16 h-8 text-sm text-right rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 focus:outline-none focus:ring-1 focus:ring-primary-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="ml-auto text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {formatMoney(d.value * n)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">Total counted</span>
        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatMoney(countTotal(counts))}
        </span>
      </div>
    </div>
  );
}
