"use client";

import { useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";

import { usePermissions } from "@/hooks/usePermissions";
import { useListEssShiftsQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import type { ShiftSchedule } from "@/features/ess/types/ess.types";
import { cn } from "@/lib/utils/cn";

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300",
  COMPLETED: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  CANCELLED: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  ON_LEAVE: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ABSENT: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium",
        STATUS_BADGE[status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
      )}
    >
      {status}
    </span>
  );
}

export default function EssShiftsPage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.shifts.read");

  const range = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return {
      from: today.toISOString(),
      to: addDays(today, 30).toISOString(),
    };
  }, []);

  const { data, isLoading, isError, error } = useListEssShiftsQuery(
    { from: range.from, to: range.to, page: 1, limit: 60 },
    { skip: !canRead },
  );

  const today = startOfDay(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
          My Shifts
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Your roster for the next 30 days.
        </p>
      </div>

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data}
        permissionDenied={!canRead}
        missingPermission="ess.shifts.read"
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No shifts scheduled"
        emptyMessage="Your manager hasn't rostered any shifts in the next 30 days."
      >
        {(d) => {
          const shiftDateSet = new Set(
            d.data
              .filter((s) => !s.isOffDay)
              .map((s) => format(new Date(s.scheduledDate), "yyyy-MM-dd")),
          );

          return (
            <div className="space-y-4">
              {/* 7-day strip */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {weekDays.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const isToday = key === format(today, "yyyy-MM-dd");
                  const hasShift = shiftDateSet.has(key);
                  return (
                    <div
                      key={key}
                      className={cn(
                        "min-w-[52px] flex flex-col items-center py-2 rounded-xl text-xs flex-shrink-0",
                        isToday
                          ? "bg-[#4263eb] text-white font-bold"
                          : hasShift
                            ? "bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 border border-primary-100 dark:border-primary-500/30"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
                      )}
                    >
                      <span className="text-[10px] uppercase tracking-wide">
                        {format(day, "EEE")}
                      </span>
                      <span className="text-base font-bold leading-none mt-0.5">
                        {format(day, "d")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Shift cards */}
              <div className="space-y-2">
                {d.data.map((s: ShiftSchedule) => (
                  <div
                    key={s.id}
                    className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-primary-200 transition-colors"
                  >
                    {/* Color strip */}
                    <div
                      className={cn(
                        "w-1 flex-shrink-0",
                        s.isOffDay ? "bg-warning-400" : "bg-primary-500",
                      )}
                    />
                    <div className="flex flex-1 items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                          {format(new Date(s.scheduledDate), "EEE, MMM d")}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                          {s.isOffDay
                            ? "Off day"
                            : `${s.plannedStart ?? "—"} – ${s.plannedEnd ?? "—"}`}
                          {!s.isOffDay && s.plannedBreakMinutes > 0 && (
                            <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                              · {s.plannedBreakMinutes}m break
                            </span>
                          )}
                        </div>
                        {s.notes && (
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                            {s.notes}
                          </div>
                        )}
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }}
      </EssStateGate>
    </div>
  );
}
