"use client";

// HR — Attendance dashboard.
//
// Three data feeds compose this page:
//   today     — the logged-in employee's clock events for the current date
//   summary   — aggregated totals (present/absent/worked minutes, etc.)
//               for the selected date range; polymorphic response:
//               single-employee when scope=self, multi-employee otherwise
//   list      — paginated raw check events (filterable by scope + event type)
//
// For the summary tiles, single-employee totals are read directly; multi-employee
// totals are summed client-side across the returned employee array so headline
// metrics are always shown regardless of scope.

import { useMemo, useState } from "react";
import { Link } from "@/shell/nav";
import { CalendarDays, Clock, ListChecks, Plus, Search, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/container";
import { cn } from "@/lib/utils/cn";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { ROUTES } from "@/constants/routes";

import {
  useGetTodayQuery,
  useGetSummaryQuery,
  useListAttendanceQuery,
} from "@/features/hr/api/attendance.api";
import { ClockInWidget } from "@/features/hr/components/ClockInWidget";
import { parseEssError } from "@/features/ess/lib/ess-error";
import {
  CHECK_EVENT_TYPES,
  formatMinutesAsHours,
  isSingleEmployeeSummary,
  type AttendanceScope,
  type CheckEventType,
} from "@/features/hr/types/attendance.types";

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(to.getUTCDate() - 29);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

// Timeline / table dot colour per event type.
const EVENT_DOT: Record<CheckEventType, string> = {
  CHECK_IN: "bg-success-500",
  CHECK_OUT: "bg-primary-400",
  BREAK_START: "bg-warning-500",
  BREAK_END: "bg-accent-500",
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AttendancePage() {
  const { can, canAny } = usePermissions();
  const canEssRead = can("ess.attendance.read");
  const canReadTeam = can("hr.attendance.read.team");
  const canReadAll = can("hr.attendance.read.all");
  const canReadAny = canAny(
    "ess.attendance.read",
    "hr.attendance.read.own",
    "hr.attendance.read.team",
    "hr.attendance.read.all",
  );
  const canRegularize = canAny(
    "ess.attendance.regularize",
    "hr.attendance.regularize.request",
    "hr.attendance.regularize.approve",
  );

  const initialScope: AttendanceScope = canReadAll ? "all" : canReadTeam ? "team" : "self";
  const [scope, setScope] = useState<AttendanceScope>(initialScope);
  const [eventType, setEventType] = useState<CheckEventType | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [range, setRange] = useState(defaultRange);

  const summary = useGetSummaryQuery({ from: range.from, to: range.to }, { skip: !canReadAny });
  const today = useGetTodayQuery(undefined, { skip: !canEssRead });
  const list = useListAttendanceQuery(
    {
      scope,
      eventType: eventType || undefined,
      page,
      limit: 20,
    },
    { skip: !canReadAny },
  );

  // ── Derived state ──
  // Single-employee totals (for the summary card row).
  const totals = useMemo(() => {
    const d = summary.data;
    if (!d) return null;
    if (isSingleEmployeeSummary(d)) return d.totals;
    // Multi-employee scope — sum across all employees for the headline tiles.
    return d.employees.reduce(
      (acc, e) => {
        for (const k of Object.keys(acc) as Array<keyof typeof acc>) {
          acc[k] += e.totals[k] ?? 0;
        }
        return acc;
      },
      {
        presentDays: 0,
        halfDays: 0,
        absentDays: 0,
        onLeaveDays: 0,
        holidayDays: 0,
        offDays: 0,
        workedMinutes: 0,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        breakMinutes: 0,
      },
    );
  }, [summary.data]);

  if (!canReadAny) {
    return (
      <PermissionDenied
        title="You don't have permission to view attendance."
        missingPermission="ess.attendance.read"
      />
    );
  }

  const tiles = totals
    ? [
        {
          label: "Present",
          value: totals.presentDays,
          tone: "text-success-700",
        },
        { label: "Half day", value: totals.halfDays, tone: "text-slate-800 dark:text-slate-100" },
        { label: "Absent", value: totals.absentDays, tone: "text-error-700" },
        {
          label: "On leave",
          value: totals.onLeaveDays,
          tone: "text-slate-800 dark:text-slate-100",
        },
        {
          label: "Worked",
          value: formatMinutesAsHours(totals.workedMinutes),
          tone: "text-slate-800 dark:text-slate-100",
        },
        {
          label: "Break",
          value: formatMinutesAsHours(totals.breakMinutes),
          tone: "text-slate-800 dark:text-slate-100",
        },
        {
          label: "Late",
          value: formatMinutesAsHours(totals.lateMinutes),
          tone: "text-warning-700",
        },
        {
          label: "Overtime",
          value: formatMinutesAsHours(totals.overtimeMinutes),
          tone: "text-slate-800",
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Track time and review your team."
        actions={
          <div className="flex gap-2">
            {canRegularize && (
              <Link href={ROUTES.HR_ATTENDANCE_CORRECTIONS_NEW}>
                <Button variant="outline" icon={<Plus className="h-4 w-4" />}>
                  Request fix
                </Button>
              </Link>
            )}
            <Link href={ROUTES.HR_ATTENDANCE_CORRECTIONS}>
              <Button variant="outline" icon={<FileText className="h-4 w-4" />}>
                Corrections
              </Button>
            </Link>
          </div>
        }
      />

      <div className="space-y-6">
        {/* Today — live tracker + timeline */}
        {canEssRead && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ClockInWidget />
            </div>

            <Card className="lg:col-span-1">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Today
                  </h2>
                </div>
                <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                  {today.data?.date ?? toIsoDate(new Date())}
                </span>
              </div>

              {today.isLoading ? (
                <Loading message="Loading today" />
              ) : today.isError ? (
                parseEssError(today.error).isNoLinkedEmployee ? (
                  <Empty
                    title="Not linked yet"
                    message="Your account isn't linked to an employee profile yet. Ask HR to link it to enable self-service attendance."
                    icon={<Clock className="h-7 w-7 text-slate-300" />}
                  />
                ) : (
                  <ErrorDisplay message="Couldn't load today" onRetry={() => today.refetch()} />
                )
              ) : !today.data || today.data.events.length === 0 ? (
                <Empty
                  title="Nothing yet"
                  message="Check in to start your day."
                  icon={<Clock className="h-7 w-7 text-slate-300" />}
                />
              ) : (
                <ol className="space-y-4 border-l border-slate-200 dark:border-slate-700 pl-5">
                  {today.data.events.map((e) => (
                    <li key={e.id} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[1.65rem] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-900",
                          EVENT_DOT[e.eventType],
                        )}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {e.eventType.replace(/_/g, " ").toLowerCase()}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {e.method.toLowerCase()}
                            {e.isRegularized && " · fixed"}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                          {timeOf(e.occurredAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        )}

        {/* Period summary */}
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800">Summary</h2>
              <span className="text-xs tabular-nums text-slate-400">
                {range.from} → {range.to}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="h-9"
              />
              <span className="text-slate-300">–</span>
              <Input
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>

          {summary.isLoading ? (
            <Loading message="Computing summary" />
          ) : summary.isError ? (
            <ErrorDisplay message="Failed to load summary" onRetry={() => summary.refetch()} />
          ) : !totals ? (
            <Empty title="No data for this range" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {tiles.map((t) => (
                <div
                  key={t.label}
                  className="rounded-lg border border-slate-200/70 bg-slate-50/40 px-3 py-2.5"
                >
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {t.label}
                  </div>
                  <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", t.tone)}>
                    {t.value}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Event log */}
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Events</h2>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={eventType}
              onValueChange={(v) => {
                setEventType(v as string as CheckEventType | "");
                setPage(1);
              }}
              placeholder="All types"
              clearable
              options={CHECK_EVENT_TYPES.map((t) => ({
                value: t,
                label: t.replace(/_/g, " "),
              }))}
            />
            <Select
              value={scope}
              onValueChange={(v) => {
                setScope(v as AttendanceScope);
                setPage(1);
              }}
              options={[
                { value: "self", label: "My events" },
                ...(canReadTeam || canReadAll ? [{ value: "team", label: "My team" }] : []),
                ...(canReadAll ? [{ value: "all", label: "All employees" }] : []),
              ]}
            />
          </div>

          {list.isLoading ? (
            <Loading />
          ) : list.isError ? (
            <ErrorDisplay message="Failed to load events" onRetry={() => list.refetch()} />
          ) : !list.data || list.data.data.length === 0 ? (
            <Empty
              title="No events"
              message="Nothing matches these filters."
              icon={<ListChecks className="h-7 w-7 text-slate-300" />}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5 font-medium">Employee</th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 font-medium">Method</th>
                      <th className="px-3 py-2.5 font-medium">When</th>
                      <th className="px-3 py-2.5 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.data
                      .filter((r) => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        const e = r.employee;
                        if (!e) return false;
                        return (
                          e.firstName.toLowerCase().includes(q) ||
                          e.lastName.toLowerCase().includes(q) ||
                          e.employeeCode.toLowerCase().includes(q)
                        );
                      })
                      .map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
                        >
                          <td className="px-3 py-2.5 text-slate-700">
                            {r.employee
                              ? `${r.employee.firstName} ${r.employee.lastName}`
                              : r.employeeId.slice(0, 8)}
                            {r.employee && (
                              <span className="ml-1 text-xs text-slate-400">
                                {r.employee.employeeCode}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={cn("h-2 w-2 rounded-full", EVENT_DOT[r.eventType])}
                              />
                              <span className="text-slate-600">
                                {r.eventType.replace(/_/g, " ").toLowerCase()}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-slate-500">{r.method}</span>
                            {r.isRegularized && (
                              <Badge variant="info" className="ml-2">
                                Fixed
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">
                            {new Date(r.occurredAt).toLocaleString([], {
                              month: "short",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="max-w-[16rem] truncate px-3 py-2.5 text-slate-500">
                            {r.notes ?? ""}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {list.data.pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    Page {list.data.pagination.page} of {list.data.pagination.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!list.data.pagination.hasMore}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
