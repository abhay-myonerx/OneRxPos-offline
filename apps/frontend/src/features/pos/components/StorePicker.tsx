"use client";

import { useState, useRef, useEffect } from "react";
import { Store, ChevronDown, Check, MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useListStoresQuery } from "@/features/stores/api/stores.api";

const LS_KEY = "pos_selected_store_id";

interface StorePickerProps {
  /** Store IDs the signed-in user may access */
  storeIds: string[];
  /** Active store ID, or `null` if none chosen */
  value: string | null;
  onChange: (storeId: string | null) => void;
  className?: string;
}

/**
 * Store selector for the POS. Loads active stores, filters by `storeIds`,
 * and persists the choice in `localStorage` under `pos_selected_store_id`.
 */
export function StorePicker({ storeIds, value, onChange, className }: StorePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: storesData, isLoading } = useListStoresQuery(
    { isActive: true, limit: 50 },
    { skip: storeIds.length === 0 },
  );

  const storeList = (storesData ?? []).filter((s) => storeIds.includes(s.id));

  const selectedStore = storeList.find((s) => s.id === value) ?? null;

  // After stores load, restore a previously saved ID if it is still allowed.
  useEffect(() => {
    if (isLoading || storeList.length === 0) return;
    if (value !== null) return;

    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved && storeList.some((s) => s.id === saved)) {
        onChange(saved);
      }
    } catch {
      /* localStorage may be unavailable (private mode, policy) */
    }
    // Only re-run when the store list is ready; do not depend on `value` or `onChange`
    // or this effect would fight manual selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, storeList.length]);

  const handleSelect = (storeId: string) => {
    try {
      localStorage.setItem(LS_KEY, storeId);
    } catch {
      /* ignore persistence errors */
    }
    onChange(storeId);
    setOpen(false);
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const isUnset = !selectedStore && !isLoading;

  // The trigger and the expanded list form ONE continuous bordered box: when
  // open, the trigger drops its bottom rounding and the panel sits flush
  // beneath it (`-mt-px` overlaps the shared 1px border into a single hairline
  // divider) using the same border colour — no floating gap, no second card.
  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "w-full flex items-center gap-3 px-3.5 py-3 border bg-white dark:bg-slate-900 text-left transition-colors",
          open
            ? "border-slate-300 dark:border-slate-700 rounded-t-lg rounded-b-none"
            : "rounded-lg border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
        )}
      >
        {/* Store icon */}
        <div className="h-9 w-9 rounded-md flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <Store className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>

        {/* Label + value */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 leading-none mb-1">
            Selling from
          </p>
          {isLoading ? (
            <span className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading stores…
            </span>
          ) : selectedStore ? (
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate leading-tight">
              {selectedStore.name}
            </p>
          ) : (
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
              Select a store to continue
            </p>
          )}
        </div>

        {/* Right-side indicator */}
        {selectedStore && (
          <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        )}

        {isUnset && (
          <span className="hidden sm:inline text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
            Required
          </span>
        )}

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select store"
          className={cn(
            "absolute z-50 top-full left-0 right-0 -mt-px",
            "rounded-b-lg border border-t-0 border-slate-300 dark:border-slate-700",
            "bg-white dark:bg-slate-900 shadow-lg shadow-slate-900/5",
            "overflow-hidden",
          )}
        >
          <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {storeList.length} store{storeList.length !== 1 ? "s" : ""} available
            </p>
          </div>

          {/* Store list */}
          <ul className="py-1 max-h-60 overflow-y-auto">
            {storeList.length === 0 && !isLoading && (
              <li className="px-3.5 py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                No stores found
              </li>
            )}

            {storeList.map((store) => {
              const isSelected = store.id === value;
              return (
                <li key={store.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(store.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                      isSelected
                        ? "bg-slate-50 dark:bg-slate-800/60"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                    )}
                  >
                    <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {store.name.slice(0, 2).toUpperCase()}
                    </div>

                    {/* Store info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
                        {store.name}
                      </p>
                      {(store.address || store.code) && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate flex items-center gap-1 mt-0.5">
                          {store.address ? (
                            <>
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              {store.address}
                            </>
                          ) : (
                            <span className="font-mono">{store.code}</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Check mark */}
                    {isSelected && (
                      <Check className="h-4 w-4 text-slate-600 dark:text-slate-300 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Footer hint */}
          <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Stock and sales data will load for the selected store
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
