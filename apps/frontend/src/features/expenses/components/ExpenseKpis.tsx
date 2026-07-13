"use client";
import { TrendingDown, Receipt, Layers, CalendarRange } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency/format-money";
import type { ExpenseSummary } from "../types/expense.types";

interface Props {
  summary?: ExpenseSummary;
  rangeLabel: string;
}

export function ExpenseKpis({ summary, rangeLabel }: Props) {
  const total = summary ? parseFloat(summary.totalAmount) : 0;
  const count = summary?.count ?? 0;
  const categories = summary?.byCategory?.length ?? 0;
  const avg = count > 0 ? total / count : 0;

  const items = [
    {
      label: "Total Spent",
      value: formatMoney(total),
      icon: <TrendingDown className="h-5 w-5" />,
      tint: "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-300",
    },
    {
      label: "Entries",
      value: count.toLocaleString(),
      icon: <Receipt className="h-5 w-5" />,
      tint: "bg-primary-50 dark:bg-primary-500/15 text-primary-600 dark:text-primary-300",
    },
    {
      label: "Categories",
      value: categories.toString(),
      icon: <Layers className="h-5 w-5" />,
      tint: "bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-300",
    },
    {
      label: "Avg / Entry",
      value: formatMoney(avg),
      icon: <CalendarRange className="h-5 w-5" />,
      tint: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((it) => (
        <Card key={it.label} className="!p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {it.label}
              </p>
              <p className="mt-2 text-2xl font-medium text-slate-900 dark:text-slate-100">
                {it.value}
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{rangeLabel}</p>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${it.tint}`}>
              {it.icon}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
