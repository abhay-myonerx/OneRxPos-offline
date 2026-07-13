"use client";
import { Search, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { ExpenseCategory } from "../types/expense.types";

export interface ExpenseFilterState {
  q: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  value: ExpenseFilterState;
  onChange: (next: ExpenseFilterState) => void;
  onReset: () => void;
  categories: ExpenseCategory[];
}

export function ExpenseFilters({ value, onChange, onReset, categories }: Props) {
  const set = <K extends keyof ExpenseFilterState>(k: K, v: ExpenseFilterState[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
          <Input
            placeholder="Search description…"
            value={value.q}
            onChange={(e) => set("q", e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="md:col-span-3">
          <Select
            value={value.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            options={[
              { value: "", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
        <div className="md:col-span-2">
          <Input
            type="date"
            value={value.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Input type="date" value={value.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
        </div>
        <div className="md:col-span-1">
          <Button
            variant="outline"
            onClick={onReset}
            className="w-full"
            icon={<RotateCcw className="h-4 w-4" />}
          >
            <span className="sr-only md:not-sr-only">Reset</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
