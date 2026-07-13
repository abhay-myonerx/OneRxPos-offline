"use client";

import { Store, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface NoStoreEmptyStateProps {
  className?: string;
}

/** Placeholder when the POS session has no active store selected. */
export function NoStoreEmptyState({ className }: NoStoreEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800",
        "bg-white dark:bg-slate-900",
        "py-16 px-6 gap-6 text-center select-none",
        "lg:min-h-[calc(100vh-320px)]",
        className,
      )}
    >
      <div className="relative">
        <div
          className={cn(
            "h-16 w-16 rounded-2xl flex items-center justify-center text-primary-700 dark:text-primary-300",
            "bg-primary-50 dark:bg-primary-400/15",
          )}
        >
          <Store className="h-7 w-7" strokeWidth={1.75} />
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 tracking-tight">
          Choose a store to sell from
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Open the{" "}
          <span className="inline-flex items-center gap-1 font-medium text-primary-700 dark:text-primary-300">
            <Store className="h-3.5 w-3.5 shrink-0" />
            Selling from
          </span>{" "}
          control above and pick a location. Your catalog and stock for that store will appear here
          right away.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-400/15 text-primary-600 dark:text-primary-300">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
        Select a store in the header
      </div>
    </div>
  );
}
