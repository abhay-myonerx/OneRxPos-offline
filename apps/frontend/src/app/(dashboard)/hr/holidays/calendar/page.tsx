"use client";

import { useMemo, useState } from "react";
import { Link } from "@/shell/nav";
import { ChevronLeft, ChevronRight, List, CalendarOff } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { ROUTES } from "@/constants/routes";

import { useGetHolidayCalendarQuery } from "@/features/hr/api/holidays.api";
import type { HolidayCalendarView, HolidayType } from "@/features/hr/types/leave.types";
import { HOLIDAY_TYPES, HOLIDAY_TYPE_LABELS } from "@/features/hr/types/leave.types";

// ─── Overview ───────────────────────────────────────────────────────────────
//
// Yearly holiday calendar: 12-month grid view of holidays for the selected year.
//
// The page fetches a single /holidays/calendar endpoint that returns the full
// year's holiday list (already filtered to the tenant + active holidays).
// Client-side, the list is indexed into a Map<isoDate, Holiday> so each
// MonthGrid can do O(1) lookups per cell rather than filtering on every render.
//
// Holiday types each carry a distinct colour token so PUBLIC / RELIGIOUS /
// OPTIONAL / COMPANY days are visually distinguishable at a glance.
//
// ─── Static config ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Single-letter weekday labels keep each month card compact and legible.
// `key` disambiguates the duplicate S / T letters for React.
const WEEKDAYS = [
  { key: "sun", label: "S", weekend: true },
  { key: "mon", label: "M", weekend: false },
  { key: "tue", label: "T", weekend: false },
  { key: "wed", label: "W", weekend: false },
  { key: "thu", label: "T", weekend: false },
  { key: "fri", label: "F", weekend: false },
  { key: "sat", label: "S", weekend: true },
];

// Each holiday type gets a distinct, on-brand swatch built from the design
// tokens (no ad-hoc colors). `dot` for legend/markers, `tint`/`ring` for cells.
const TYPE_STYLES: Record<HolidayType, { dot: string; tint: string; ring: string; text: string }> =
  {
    PUBLIC: {
      dot: "bg-primary-500",
      tint: "bg-primary-50 dark:bg-primary-500/15",
      ring: "ring-primary-200",
      text: "text-primary-700 dark:text-primary-300",
    },
    RELIGIOUS: {
      dot: "bg-accent-500",
      tint: "bg-accent-50 dark:bg-accent-500/15",
      ring: "ring-accent-200",
      text: "text-accent-700 dark:text-accent-300",
    },
    OPTIONAL: {
      dot: "bg-warning-500",
      tint: "bg-warning-50 dark:bg-warning-500/15",
      ring: "ring-warning-200",
      text: "text-warning-700 dark:text-warning-300",
    },
    COMPANY: {
      dot: "bg-success-500",
      tint: "bg-success-50 dark:bg-success-500/15",
      ring: "ring-success-200",
      text: "text-success-700 dark:text-success-300",
    },
  };

// ─── Date helpers ─────────────────────────────────────────────────────────────

type CalendarHoliday = HolidayCalendarView["holidays"][number];

// Produces a 7-column cell array for a month grid: leading null values fill the
// empty days before the 1st so that day-of-week alignment is correct.
function buildMonthCells(year: number, month: number): (number | null)[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function isoDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function todayIso(): string {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatMonthDay(iso: string): string {
  // iso is YYYY-MM-DD; render as e.g. "Jan 01" without TZ surprises.
  const [, mm, dd] = iso.split("-");
  return `${MONTH_NAMES[Number(mm) - 1].slice(0, 3)} ${dd}`;
}

// ─── Single month grid ────────────────────────────────────────────────────────

interface MonthGridProps {
  year: number;
  month: number;
  holidaysByDate: Map<string, CalendarHoliday>;
  today: string;
}

function MonthGrid({ year, month, holidaysByDate, today }: MonthGridProps) {
  const cells = buildMonthCells(year, month);

  let count = 0;
  for (let d = 1; d <= 31; d++) {
    if (holidaysByDate.has(isoDate(year, month, d))) count++;
  }

  return (
    <Card padding={false} className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {MONTH_NAMES[month]}
        </h3>
        {count > 0 && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {count}
          </span>
        )}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((d) => (
          <div
            key={d.key}
            className={`pb-1.5 text-center text-[11px] font-medium ${
              d.weekend ? "text-slate-300" : "text-slate-400 dark:text-slate-500"
            }`}
          >
            {d.label}
          </div>
        ))}

        {cells.map((day, idx) => {
          if (day === null) return <div key={`pad-${idx}`} />;

          const iso = isoDate(year, month, day);
          const holiday = holidaysByDate.get(iso);
          const isToday = iso === today;
          const isWeekend = idx % 7 === 0 || idx % 7 === 6;
          const style = holiday ? TYPE_STYLES[holiday.type] : null;

          return (
            <div key={iso} className="flex items-center justify-center">
              <div className="group relative">
                <div
                  className={[
                    "flex h-8 w-8 flex-col items-center justify-center rounded-lg text-[13px] leading-none transition-colors",
                    style ? `${style.tint} font-semibold ${style.text}` : "",
                    !style && isWeekend ? "text-slate-300" : "",
                    !style && !isWeekend ? "text-slate-600 dark:text-slate-300" : "",
                    isToday ? `ring-1 ${style ? style.ring : "ring-primary-300"}` : "",
                  ].join(" ")}
                >
                  <span>{day}</span>
                  {style && (
                    <span className={`mt-0.5 h-1 w-1 rounded-full ${style.dot}`} aria-hidden />
                  )}
                </div>

                {holiday && (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-left text-xs text-white shadow-lg group-hover:block"
                  >
                    <span className="block font-medium">{holiday.name}</span>
                    <span className="block text-[11px] text-slate-300">
                      {HOLIDAY_TYPE_LABELS[holiday.type]}
                    </span>
                    <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HolidayCalendarPage() {
  const { canAny } = usePermissions();
  const canRead = canAny("hr.holidays.read", "hr.holidays.manage", "ess.holidays.read");

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const today = todayIso();
  const currentYear = new Date().getFullYear();

  const {
    data: calendar,
    isLoading,
    isError,
    refetch,
  } = useGetHolidayCalendarQuery({ year }, { skip: !canRead });

  // Index holidays once per data change: lookup map, per-type counts, and a
  // sorted "upcoming" slice for the side rail.
  const { holidaysByDate, total, typeCounts, upcoming } = useMemo(() => {
    const map = new Map<string, CalendarHoliday>();
    const counts: Record<HolidayType, number> = {
      PUBLIC: 0,
      RELIGIOUS: 0,
      OPTIONAL: 0,
      COMPANY: 0,
    };

    const list = calendar?.holidays ?? [];
    for (const h of list) {
      const key = h.date.slice(0, 10);
      map.set(key, h);
      counts[h.type] += 1;
    }

    const sorted = [...list].sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)));
    const next = sorted.filter((h) => h.date.slice(0, 10) >= today);
    const upcomingList = (next.length > 0 ? next : sorted).slice(0, 6);

    return {
      holidaysByDate: map,
      total: list.length,
      typeCounts: counts,
      upcoming: upcomingList,
    };
  }, [calendar, today]);

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view the holiday calendar."
        missingPermission="hr.holidays.read"
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Holiday Calendar"
        description={`Public and company holidays for ${year}.`}
        actions={
          <Button asChild variant="outline" icon={<List className="h-4 w-4" />}>
            <Link href={ROUTES.HR_HOLIDAYS}>List view</Link>
          </Button>
        }
      />

      {/* Toolbar: year stepper · totals · type legend */}
      <Card className="mb-6" padding={false}>
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 p-0.5">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous year"
                onClick={() => setYear((y) => y - 1)}
                icon={<ChevronLeft className="h-4 w-4" />}
              />
              <span className="w-16 text-center text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {year}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next year"
                onClick={() => setYear((y) => y + 1)}
                icon={<ChevronRight className="h-4 w-4" />}
              />
            </div>

            {year !== currentYear && (
              <Button variant="ghost" size="sm" onClick={() => setYear(currentYear)}>
                Today
              </Button>
            )}

            {!isLoading && !isError && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span>{" "}
                {total === 1 ? "holiday" : "holidays"}
              </span>
            )}
          </div>

          {/* Type legend — replaces the old wall of per-holiday pills */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {HOLIDAY_TYPES.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300"
              >
                <span className={`h-2 w-2 rounded-full ${TYPE_STYLES[t].dot}`} aria-hidden />
                {HOLIDAY_TYPE_LABELS[t]}
                <span className="tabular-nums text-slate-400 dark:text-slate-500">
                  {typeCounts[t]}
                </span>
              </span>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load holiday calendar." onRetry={refetch} />
      ) : total === 0 ? (
        <Card className="py-14">
          <div className="mx-auto flex max-w-sm flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <CalendarOff className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <h3 className="text-base font-medium text-slate-800 dark:text-slate-100">
              No holidays for {year}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add or import holidays from{" "}
              <Link
                href={ROUTES.HR_HOLIDAYS}
                className="font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700"
              >
                Holiday Management
              </Link>{" "}
              to see them here.
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6 xl:flex-row">
          {/* 12-month grid */}
          <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }, (_, i) => (
              <MonthGrid
                key={i}
                year={year}
                month={i}
                holidaysByDate={holidaysByDate}
                today={today}
              />
            ))}
          </div>

          {/* Side rail: the next few holidays */}
          <aside className="xl:w-72 xl:shrink-0">
            <Card padding={false} className="p-5 xl:sticky xl:top-6">
              <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {upcoming.some((h) => h.date.slice(0, 10) >= today) ? "Coming up" : "Holidays"}
              </h3>
              <ul className="space-y-3">
                {upcoming.map((h) => {
                  const iso = h.date.slice(0, 10);
                  const style = TYPE_STYLES[h.type];
                  return (
                    <li key={h.id} className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                          {h.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {formatMonthDay(iso)} · {HOLIDAY_TYPE_LABELS[h.type]}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
