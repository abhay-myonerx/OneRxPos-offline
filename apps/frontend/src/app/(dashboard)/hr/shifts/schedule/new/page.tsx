"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "@/shell/nav";
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import { useListEmployeesQuery } from "@/features/hr/api/employees.api";
import {
  useCreateBulkScheduleMutation,
  useListWorkShiftsQuery,
} from "@/features/hr/api/shifts.api";
import type {
  ScheduleConflict,
  ScheduleEntryInput,
  ShiftSchedule,
} from "@/features/hr/types/shift.types";

interface Row extends ScheduleEntryInput {
  rowKey: string;
}

const blankRow = (): Row => ({
  rowKey: crypto.randomUUID(),
  employeeId: "",
  scheduledDate: new Date().toISOString().slice(0, 10),
  workShiftId: "",
  isOffDay: false,
  notes: null,
});

export default function NewBulkSchedulePage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCreate = can("hr.shifts.schedule.create");

  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [overrideExisting, setOverrideExisting] = useState(false);
  const [created, setCreated] = useState<ShiftSchedule[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);

  const templates = useListWorkShiftsQuery({ isActive: true, limit: 100 });
  const employees = useListEmployeesQuery({
    archived: "active",
    limit: 100,
  });

  const [createBulk, { isLoading }] = useCreateBulkScheduleMutation();

  const tplOptions = useMemo(() => templates.data?.data ?? [], [templates.data]);
  const empOptions = useMemo(() => employees.data?.data ?? [], [employees.data]);

  if (!canCreate) {
    return (
      <PermissionDenied
        title="You don't have permission to create rosters."
        missingPermission="hr.shifts.schedule.create"
      />
    );
  }

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }

  function removeRow(idx: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, i) => i !== idx)));
  }

  function duplicateAcrossWeek(idx: number) {
    const base = rows[idx];
    if (!base) return;
    const baseDate = new Date(base.scheduledDate);
    const extras: Row[] = [];
    for (let d = 1; d < 7; d += 1) {
      const next = new Date(baseDate);
      next.setUTCDate(baseDate.getUTCDate() + d);
      extras.push({
        ...base,
        rowKey: crypto.randomUUID(),
        scheduledDate: next.toISOString().slice(0, 10),
      });
    }
    setRows((rs) => [...rs, ...extras]);
  }

  const isValid = rows.every(
    (r) =>
      r.employeeId &&
      r.scheduledDate &&
      (r.isOffDay || (r.workShiftId && r.workShiftId.length > 0)),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Every row needs an employee, a date, and either a template or isOffDay.",
          },
        },
      });
      return;
    }
    try {
      const result = await createBulk({
        entries: rows.map((r) => ({
          employeeId: r.employeeId,
          scheduledDate: r.scheduledDate,
          workShiftId: r.isOffDay ? null : r.workShiftId || null,
          isOffDay: r.isOffDay,
          notes: r.notes ?? null,
        })),
        overrideExisting,
      }).unwrap();
      setCreated(result.created);
      setConflicts(result.conflicts);
      if (result.created.length > 0) {
        showSuccess(
          `Created ${result.created.length} schedule${result.created.length === 1 ? "" : "s"}` +
            (result.conflicts.length > 0
              ? ` — ${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} below.`
              : "."),
        );
      }
      if (result.conflicts.length === 0 && result.created.length > 0) {
        // Soft redirect, but keep the result table visible for a moment.
        setTimeout(() => navigate(ROUTES.HR_SHIFTS_SCHEDULE), 800);
      }
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Add schedules (bulk)"
        description="Add up to 500 employee-date pairs at once. Each row snapshots the chosen template — editing the template later won't rewrite these schedules."
      />

      {templates.isLoading || employees.isLoading ? (
        <Loading />
      ) : templates.isError || employees.isError ? (
        <ErrorDisplay
          message="Failed to load shift templates or employees."
          onRetry={() => {
            templates.refetch();
            employees.refetch();
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Employee</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Shift template</th>
                  <th className="text-left px-3 py-2 font-medium">Off-day</th>
                  <th className="text-left px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.rowKey} className="border-t align-top">
                    <td className="px-3 py-2 min-w-[14rem]">
                      <Select
                        size="sm"
                        value={r.employeeId}
                        onValueChange={(v) => setRow(idx, { employeeId: v as string })}
                        placeholder="Select employee…"
                        searchable
                        options={empOptions.map((emp) => ({
                          value: emp.id,
                          label: `${emp.firstName} ${emp.lastName} (${emp.employeeCode})`,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="date"
                        value={r.scheduledDate}
                        onChange={(e) => setRow(idx, { scheduledDate: e.target.value })}
                        required
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[14rem]">
                      <Select
                        size="sm"
                        value={r.workShiftId ?? ""}
                        onValueChange={(v) => setRow(idx, { workShiftId: (v as string) || null })}
                        disabled={r.isOffDay}
                        placeholder="Select template…"
                        clearable
                        options={tplOptions.map((t) => ({
                          value: t.id,
                          label: `${t.name} (${t.startTime} – ${t.endTime})`,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Checkbox
                        label="OFF"
                        checked={!!r.isOffDay}
                        onChange={(e) =>
                          setRow(idx, {
                            isOffDay: e.target.checked,
                            workShiftId: e.target.checked ? null : r.workShiftId,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={r.notes ?? ""}
                        onChange={(e) => setRow(idx, { notes: e.target.value || null })}
                        placeholder="optional"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => duplicateAcrossWeek(idx)}
                      >
                        +6 days
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRow(idx)}
                        icon={<Trash2 className="h-4 w-4" />}
                        disabled={rows.length === 1}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="flex flex-wrap items-center gap-3 justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={addRow}
              icon={<Plus className="h-4 w-4" />}
            >
              Add row
            </Button>
            <label className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
              <input
                type="checkbox"
                checked={overrideExisting}
                onChange={(e) => setOverrideExisting(e.target.checked)}
              />
              Override existing SCHEDULED rows on the same (employee, date)
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(ROUTES.HR_SHIFTS_SCHEDULE)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={isLoading} disabled={!isValid || rows.length === 0}>
                Create schedules
              </Button>
            </div>
          </div>
        </form>
      )}

      {(created.length > 0 || conflicts.length > 0) && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Last submission</h2>
          {created.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-success-600 dark:text-success-300 mt-0.5" />
              <p>
                <strong>{created.length}</strong> schedule
                {created.length === 1 ? "" : "s"} created successfully.
              </p>
            </div>
          )}
          {conflicts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-sm mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                <p>
                  <strong>{conflicts.length}</strong> row
                  {conflicts.length === 1 ? "" : "s"} could not be created:
                </p>
              </div>
              <ul className="space-y-1 text-sm">
                {conflicts.map((c) => (
                  <li
                    key={`${c.index}-${c.employeeId}-${c.scheduledDate}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Badge variant="warning">{c.code}</Badge>
                    <span className="font-mono text-xs">
                      row {c.index + 1} · {c.employeeId} · {c.scheduledDate}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">— {c.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
