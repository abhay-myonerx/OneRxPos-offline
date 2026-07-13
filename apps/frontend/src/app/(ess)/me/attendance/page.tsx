"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ClipboardCheck, LogIn, LogOut, Coffee } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form/form-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useGetEssAttendanceTodayQuery,
  useListEssAttendanceQuery,
  useEssRegularizeMutation,
} from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import { CheckInOutWidget } from "@/features/ess/components/CheckInOutWidget";
import type { EssRegularizeInput } from "@/features/ess/types/ess.types";
import { SkeletonCard } from "@/components/ui/skeleton";

const EVENT_TYPES = ["CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END"] as const;

const EVENT_META: Record<string, { icon: React.ReactNode; label: string }> = {
  CHECK_IN: {
    icon: <LogIn className="h-3.5 w-3.5 text-success-600 dark:text-success-300" />,
    label: "Check in",
  },
  CHECK_OUT: {
    icon: <LogOut className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />,
    label: "Check out",
  },
  BREAK_START: {
    icon: <Coffee className="h-3.5 w-3.5 text-warning-600 dark:text-warning-300" />,
    label: "Break start",
  },
  BREAK_END: {
    icon: <Coffee className="h-3.5 w-3.5 text-warning-600 dark:text-warning-300" />,
    label: "Break end",
  },
};

export default function EssAttendancePage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.attendance.read");
  const canRegularize = canAny("ess.attendance.regularize");

  const { data: today, isLoading: todayLoading } = useGetEssAttendanceTodayQuery(undefined, {
    skip: !canRead,
  });
  const {
    data: listData,
    isLoading,
    isError,
    error,
  } = useListEssAttendanceQuery({ page: 1, limit: 30 }, { skip: !canRead });
  const [regularize, regState] = useEssRegularizeMutation();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EssRegularizeInput>({
    requestedDate: format(new Date(), "yyyy-MM-dd"),
    eventType: "CHECK_IN",
    requestedTime: new Date().toISOString().slice(0, 16),
    reason: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await regularize({
        ...form,
        requestedTime: new Date(form.requestedTime).toISOString(),
        requestedDate: new Date(form.requestedDate).toISOString(),
      }).unwrap();
      showSuccess("Regularization request submitted");
      setOpen(false);
      setForm({ ...form, reason: "" });
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
            My Attendance
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Check in / out and review your attendance history.
          </p>
        </div>
        {canRegularize && (
          <Button
            variant="outline"
            leftIcon={<ClipboardCheck className="h-4 w-4" />}
            onClick={() => setOpen(true)}
          >
            Request correction
          </Button>
        )}
      </div>

      {todayLoading ? <SkeletonCard /> : <CheckInOutWidget today={today ?? null} />}

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={listData}
        permissionDenied={!canRead}
        missingPermission="ess.attendance.read"
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No attendance records yet"
        emptyMessage="Your check-ins and check-outs will appear here once you start working."
      >
        {(d) => (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      When
                    </th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Event
                    </th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Method
                    </th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.data.map((r) => {
                    const meta = EVENT_META[r.eventType] ?? {
                      icon: null,
                      label: r.eventType,
                    };
                    return (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-2.5 whitespace-nowrap text-slate-700 dark:text-slate-200">
                          {format(new Date(r.occurredAt), "MMM d, h:mm a")}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                            {meta.icon}
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline">{r.method}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          {r.notes ?? "—"}
                          {r.isRegularized && (
                            <span className="ml-2 inline-flex items-center rounded bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              Regularized
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </EssStateGate>

      <Modal open={open} onClose={() => setOpen(false)} title="Request correction">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Date" required>
            <Input
              type="date"
              value={form.requestedDate.slice(0, 10)}
              onChange={(e) => setForm({ ...form, requestedDate: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Event" required>
            <Select
              value={form.eventType}
              options={EVENT_TYPES.map((t) => ({
                value: t,
                label: t.replace("_", " "),
              }))}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  eventType: v as (typeof EVENT_TYPES)[number],
                })
              }
            />
          </FormField>
          <FormField label="Time" required>
            <Input
              type="datetime-local"
              value={form.requestedTime.slice(0, 16)}
              onChange={(e) => setForm({ ...form, requestedTime: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Reason" required>
            <Textarea
              rows={3}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
              minLength={3}
              maxLength={2000}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={regState.isLoading}>
              Submit
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
