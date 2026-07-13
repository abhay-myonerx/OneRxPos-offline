"use client";

import { useMemo, useState } from "react";
import { Link } from "@/shell/nav";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import { useCancelScheduleMutation, useListSchedulesQuery } from "@/features/hr/api/shifts.api";
import type {
  ScheduleListParams,
  ShiftSchedule,
  ShiftScheduleStatus,
} from "@/features/hr/types/shift.types";

function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = c.getUTCDay();
  c.setUTCDate(c.getUTCDate() - dow);
  return c;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

// Prefer a human name; fall back to the employee code, then the raw id.
function employeeName(s: ShiftSchedule | undefined, fallbackId: string): string {
  const e = s?.employee;
  const name = `${e?.firstName ?? ""} ${e?.lastName ?? ""}`.trim();
  return name || e?.employeeCode || fallbackId;
}

const STATUS_VARIANT: Record<
  ShiftScheduleStatus,
  "success" | "warning" | "danger" | "outline" | "default"
> = {
  SCHEDULED: "default",
  COMPLETED: "success",
  ABSENT: "danger",
  ON_LEAVE: "warning",
  CANCELLED: "outline",
  SWAPPED: "outline",
};

export default function ShiftSchedulePage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.shifts.schedule.read", "ess.shifts.read");
  const canCreate = can("hr.shifts.schedule.create");
  const canDelete = can("hr.shifts.schedule.delete");
  const canTeam = can("hr.shifts.schedule.read");
  const canAll = canAny("hr.shifts.schedule.read"); // admin/HR see all via backend role check

  type Scope = "self" | "team" | "all";
  const initialScope: Scope = canAll ? "all" : canTeam ? "team" : "self";
  const [scope, setScope] = useState<Scope>(initialScope);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [pendingDelete, setPendingDelete] = useState<ShiftSchedule | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const params = useMemo<ScheduleListParams>(
    () => ({
      scope,
      from: toIsoDate(weekStart),
      to: toIsoDate(weekEnd),
      limit: 100,
      sortBy: "scheduledDate",
      sortOrder: "asc",
    }),
    [scope, weekStart, weekEnd],
  );

  const { data, isLoading, isError, refetch } = useListSchedulesQuery(params, {
    skip: !canRead,
  });
  const [cancelSchedule, { isLoading: deleting }] = useCancelScheduleMutation();

  const items = useMemo(() => data?.data ?? [], [data]);

  // Group by employee, then by date.
  const grouped = useMemo(() => {
    const byEmp = new Map<string, Map<string, ShiftSchedule>>();
    for (const s of items) {
      const d = s.scheduledDate.slice(0, 10);
      const map = byEmp.get(s.employeeId) ?? new Map<string, ShiftSchedule>();
      map.set(d, s);
      byEmp.set(s.employeeId, map);
    }
    return byEmp;
  }, [items]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view rosters."
        missingPermission="hr.shifts.schedule.read"
      />
    );
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await cancelSchedule(pendingDelete.id).unwrap();
      showSuccess("Schedule cancelled");
      setPendingDelete(null);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roster"
        description="Weekly shift assignments by employee."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.HR_SHIFTS}>
              <Button variant="outline" icon={<Clock className="h-4 w-4" />}>
                Templates
              </Button>
            </Link>
            {canCreate && (
              <Link href={ROUTES.HR_SHIFTS_SCHEDULE_NEW}>
                <Button icon={<Plus className="h-4 w-4" />}>Add</Button>
              </Link>
            )}
          </div>
        }
      />

      {/* Week navigator + scope */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            icon={<ChevronLeft className="h-4 w-4" />}
            aria-label="Previous week"
          />
          <span className="min-w-[150px] text-center text-sm font-medium text-slate-700 dark:text-slate-200">
            {toIsoDate(weekStart)} – {toIsoDate(weekEnd)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            icon={<ChevronRight className="h-4 w-4" />}
            aria-label="Next week"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            icon={<CalendarDays className="h-4 w-4" />}
          >
            Today
          </Button>
        </div>
        <div className="w-32">
          <Select
            size="sm"
            value={scope}
            onValueChange={(v) => setScope(v as Scope)}
            options={[
              { value: "self", label: "Self" },
              ...(canTeam ? [{ value: "team", label: "Team" }] : []),
              ...(canAll ? [{ value: "all", label: "All" }] : []),
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load roster." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No shifts this week"
          message={
            canCreate
              ? "Use Add to roster employees onto a shift."
              : "Nothing rostered for this scope yet."
          }
          icon={<CalendarDays className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
          action={
            canCreate ? (
              <Link href={ROUTES.HR_SHIFTS_SCHEDULE_NEW}>
                <Button icon={<Plus className="h-4 w-4" />}>Add</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                  Employee
                </th>
                {days.map((d) => (
                  <th key={toIsoDate(d)} className="px-3 py-2 text-left text-xs font-medium">
                    {d.toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([empId, dayMap]) => {
                const first = Array.from(dayMap.values())[0];
                const label = employeeName(first, empId);
                const code = first?.employee?.employeeCode;
                return (
                  <tr key={empId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{label}</div>
                      {code && code !== label && (
                        <div className="font-mono text-xs text-slate-400 dark:text-slate-500">
                          {code}
                        </div>
                      )}
                    </td>
                    {days.map((d) => {
                      const iso = toIsoDate(d);
                      const s = dayMap.get(iso);
                      if (!s) {
                        return (
                          <td key={iso} className="px-3 py-2 text-slate-300">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={iso} className="px-3 py-2 align-top">
                          <div className="flex flex-col gap-1">
                            {s.isOffDay ? (
                              <Badge variant="outline">OFF</Badge>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{
                                    background: s.workShift?.color ?? "#94a3b8",
                                  }}
                                  aria-hidden
                                />
                                {s.plannedStart}–{s.plannedEnd}
                              </span>
                            )}
                            {s.workShift && !s.isOffDay && (
                              <span className="pl-3.5 text-xs text-slate-400 dark:text-slate-500">
                                {s.workShift.name}
                              </span>
                            )}
                            <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                            {canDelete && s.status === "SCHEDULED" && (
                              <button
                                type="button"
                                onClick={() => setPendingDelete(s)}
                                className="inline-flex items-center gap-1 self-start text-xs text-slate-400 dark:text-slate-500 transition-colors hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Cancel this schedule?"
        description={
          pendingDelete
            ? `Mark ${employeeName(pendingDelete, pendingDelete.employeeId)}'s shift on ${pendingDelete.scheduledDate.slice(0, 10)} as cancelled.`
            : ""
        }
        confirmLabel="Cancel schedule"
        loading={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
