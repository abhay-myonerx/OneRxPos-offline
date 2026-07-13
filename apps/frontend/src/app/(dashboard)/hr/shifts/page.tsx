"use client";

import { useMemo, useState } from "react";
import { Link } from "@/shell/nav";
import { CalendarDays, Clock, Edit, Moon, Plus, RefreshCw, Sun } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import {
  useCreateWorkShiftMutation,
  useDeactivateWorkShiftMutation,
  useListWorkShiftsQuery,
  useRestoreWorkShiftMutation,
  useUpdateWorkShiftMutation,
} from "@/features/hr/api/shifts.api";
import type { WorkShift, WorkShiftCreateInput } from "@/features/hr/types/shift.types";
import { crossesMidnight } from "@/features/hr/types/shift.types";

const EMPTY: WorkShiftCreateInput = {
  name: "",
  code: "",
  startTime: "09:00",
  endTime: "17:00",
  breakMinutes: 60,
  graceMinutes: 15,
  color: "#3B82F6",
  nightDifferentialPct: null,
  storeId: null,
};

// Strict HH:mm validation — the backend stores times as strings and the
// payroll engine parses them verbatim, so we enforce format client-side.
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidForm(f: WorkShiftCreateInput): boolean {
  if (!f.name.trim() || !f.code.trim()) return false;
  if (!HHMM_RE.test(f.startTime) || !HHMM_RE.test(f.endTime)) return false;
  if (f.startTime === f.endTime) return false;
  return true;
}

export default function ShiftTemplatesPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny(
    "hr.shifts.read",
    "hr.shifts.template.manage",
    "hr.shifts.schedule.read",
    "hr.shifts.schedule.create",
  );
  const canManage = can("hr.shifts.template.manage");
  const canSchedule = canAny("hr.shifts.schedule.read", "hr.shifts.schedule.create");

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkShift | null>(null);
  const [form, setForm] = useState<WorkShiftCreateInput>(EMPTY);

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      ...(showInactive ? {} : { isActive: true }),
    }),
    [search, showInactive],
  );

  const { data, isLoading, isError, refetch } = useListWorkShiftsQuery(params, {
    skip: !canRead,
  });

  const [create, { isLoading: creating }] = useCreateWorkShiftMutation();
  const [update, { isLoading: updating }] = useUpdateWorkShiftMutation();
  const [deactivate] = useDeactivateWorkShiftMutation();
  const [restore] = useRestoreWorkShiftMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view shift templates."
        missingPermission="hr.shifts.read"
      />
    );
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(s: WorkShift) {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code,
      startTime: s.startTime,
      endTime: s.endTime,
      breakMinutes: s.breakMinutes,
      graceMinutes: s.graceMinutes,
      color: s.color ?? "#3B82F6",
      isNightShift: s.isNightShift,
      nightDifferentialPct: s.nightDifferentialPct == null ? null : Number(s.nightDifferentialPct),
      storeId: s.storeId,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidForm(form)) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Name, code, and valid HH:mm start/end (not equal) are required.",
          },
        },
      });
      return;
    }
    try {
      if (editing) {
        await update({ id: editing.id, data: form }).unwrap();
        showSuccess("Template updated");
      } else {
        await create(form).unwrap();
        showSuccess("Template created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleToggleActive(s: WorkShift) {
    try {
      if (s.isActive) {
        await deactivate(s.id).unwrap();
        showSuccess("Template deactivated");
      } else {
        await restore(s.id).unwrap();
        showSuccess("Template restored");
      }
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Shift Templates"
        description="Reusable work shifts that feed the roster."
        actions={
          <div className="flex flex-wrap gap-2">
            {canSchedule && (
              <Link href={ROUTES.HR_SHIFTS_SCHEDULE}>
                <Button variant="outline" icon={<CalendarDays className="h-4 w-4" />}>
                  Roster
                </Button>
              </Link>
            )}
            <Link href={ROUTES.HR_SHIFTS_SWAPS}>
              <Button variant="outline" icon={<RefreshCw className="h-4 w-4" />}>
                Swaps
              </Button>
            </Link>
            {canManage && (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                New
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load shift templates." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No templates yet"
          message={
            canManage ? "Create one to start rostering." : "Ask an administrator to add templates."
          }
          icon={<Clock className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                New template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            // A shift where end < start crosses midnight; the "+1" badge warns
            // schedulers so they don't misread the displayed duration.
            const overnight = crossesMidnight(s.startTime, s.endTime);
            return (
              <Card
                key={s.id}
                className={
                  "flex flex-col gap-3 p-4 transition-shadow hover:shadow-sm " +
                  (s.isActive ? "" : "opacity-70")
                }
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: s.color ?? "#3B82F6" }}
                      aria-hidden
                    >
                      {s.isNightShift ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {s.name}
                      </h3>
                      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                        {s.code}
                      </p>
                    </div>
                  </div>
                  {!s.isActive && <Badge variant="outline">Inactive</Badge>}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                    {s.startTime}–{s.endTime}
                    {overnight && (
                      <span className="text-xs text-amber-600 dark:text-amber-300">+1</span>
                    )}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">·</span>
                  <span>
                    {s.breakMinutes}m break · {s.graceMinutes}m grace
                  </span>
                  {s.nightDifferentialPct != null && (
                    <>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <span>+{s.nightDifferentialPct}% night</span>
                    </>
                  )}
                </div>

                {canManage && (
                  <div className="flex justify-end gap-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(s)}
                      icon={<Edit className="h-4 w-4" />}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(s)}>
                      {s.isActive ? "Deactivate" : "Restore"}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit template" : "New template"}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">Name</span>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={100}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">Code</span>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                maxLength={50}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">Start</span>
              <Input
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                placeholder="HH:mm"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">End</span>
              <Input
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                pattern="^([01]\d|2[0-3]):([0-5]\d)$"
                placeholder="HH:mm"
                required
              />
              {form.startTime && form.endTime && crossesMidnight(form.startTime, form.endTime) && (
                <span className="mt-1 block text-xs text-amber-600 dark:text-amber-300">
                  Crosses midnight
                </span>
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">
                Break (min)
              </span>
              <Input
                type="number"
                min={0}
                max={1440}
                value={form.breakMinutes ?? 0}
                onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">
                Grace (min)
              </span>
              <Input
                type="number"
                min={0}
                max={240}
                value={form.graceMinutes ?? 0}
                onChange={(e) => setForm({ ...form, graceMinutes: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">
                Night diff %
              </span>
              <Input
                type="number"
                min={0}
                max={999.99}
                step={0.01}
                value={form.nightDifferentialPct ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    nightDifferentialPct: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-slate-700 dark:text-slate-200">Color</span>
              <Input
                type="color"
                value={form.color ?? "#3B82F6"}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 p-1"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating} disabled={!isValidForm(form)}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
