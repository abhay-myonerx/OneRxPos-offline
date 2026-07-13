"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import { useListEssHolidaysQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";

const TYPE_VARIANT: Record<string, "success" | "info" | "warning" | "outline"> = {
  PUBLIC: "success",
  COMPANY: "info",
  RELIGIOUS: "warning",
  OPTIONAL: "outline",
};

export default function EssHolidaysPage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.holidays.read");

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const years = useMemo(() => [currentYear - 1, currentYear, currentYear + 1], [currentYear]);

  const { data, isLoading, isError, error } = useListEssHolidaysQuery({ year }, { skip: !canRead });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Holidays
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Holidays for your store and the public calendar.
          </p>
        </div>
        <div className="w-32">
          <Select
            value={String(year)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            onValueChange={(v) => setYear(Number(v))}
          />
        </div>
      </div>

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        permissionDenied={!canRead}
        missingPermission="ess.holidays.read"
        isEmpty={(d) => d.holidays.length === 0}
        emptyTitle="No holidays for this year"
        emptyMessage="There are no holidays configured for the selected year."
      >
        {(d) => (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.holidays.map((h) => {
                const date = parseISO(h.date);
                return (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-500/15 text-primary-800 dark:text-primary-300 flex-shrink-0">
                        <span className="text-[10px] uppercase font-semibold">
                          {format(date, "MMM")}
                        </span>
                        <span className="text-lg font-bold leading-none">{format(date, "d")}</span>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {h.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {format(date, "EEEE")}
                          {h.countryCode ? ` · ${h.countryCode}` : ""}
                        </div>
                      </div>
                    </div>
                    <Badge variant={TYPE_VARIANT[h.type] ?? "outline"}>{h.type}</Badge>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </EssStateGate>
    </div>
  );
}
