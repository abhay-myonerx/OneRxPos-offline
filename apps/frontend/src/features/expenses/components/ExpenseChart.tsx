"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/currency/format-money";
import { useAppSelector } from "@/store/hooks";
import type { ExpenseSummary } from "../types/expense.types";

const COLORS = [
  "#233699",
  "#02BCF5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

interface Props {
  summary?: ExpenseSummary;
}

export function ExpenseChart({ summary }: Props) {
  const isDark = useAppSelector((s) => s.uiPrefs.resolvedTheme) === "dark";
  const data =
    summary?.byCategory?.map((c) => ({
      name: c.categoryName,
      value: parseFloat(c.total),
      count: c.count,
    })) ?? [];

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Spend by Category</CardTitle>
      </CardHeader>

      {data.length === 0 ? (
        <div className="flex items-center justify-center h-[260px]">
          <p className="text-sm text-slate-400 dark:text-slate-500">No data for this range</p>
        </div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  innerRadius={62}
                  dataKey="value"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => formatMoney(v)}
                  contentStyle={{
                    borderRadius: 8,
                    border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                    background: isDark ? "#1e293b" : "#fff",
                    color: isDark ? "#e2e8f0" : "#1e293b",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Total
              </p>
              <p className="text-lg font-medium text-slate-800 dark:text-slate-100">
                {formatMoney(total)}
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2 max-h-[140px] overflow-y-auto pr-1">
            {data.map((d, i) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <li key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 shrink-0">
                    <span>{pct.toFixed(1)}%</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {formatMoney(d.value)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
