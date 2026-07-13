"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "@/shell/nav";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import { useListEmployeesQuery } from "@/features/hr/api/employees.api";
import { useListSchedulesQuery, useRequestSwapMutation } from "@/features/hr/api/shifts.api";

export default function NewSwapRequestPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canRequest = can("hr.shifts.swap.request.own");

  const [requesterScheduleId, setRequesterScheduleId] = useState("");
  const [counterpartEmployeeId, setCounterpartEmployeeId] = useState("");
  const [counterpartScheduleId, setCounterpartScheduleId] = useState("");
  const [reason, setReason] = useState("");

  const today = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);

  const mine = useListSchedulesQuery({
    scope: "self",
    status: "SCHEDULED",
    from: today,
    limit: 50,
    sortBy: "scheduledDate",
    sortOrder: "asc",
  });

  const counterpart = useListSchedulesQuery(
    {
      scope: "team",
      status: "SCHEDULED",
      from: today,
      employeeId: counterpartEmployeeId || undefined,
      limit: 50,
      sortBy: "scheduledDate",
      sortOrder: "asc",
    },
    { skip: !counterpartEmployeeId },
  );

  const employees = useListEmployeesQuery(
    { archived: "active", limit: 100 },
    { skip: !canRequest },
  );

  const [requestSwap, { isLoading }] = useRequestSwapMutation();

  if (!canRequest) {
    return (
      <PermissionDenied
        title="You don't have permission to request shift swaps."
        missingPermission="hr.shifts.swap.request.own"
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requesterScheduleId || !counterpartEmployeeId) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Pick your shift and a counterpart.",
          },
        },
      });
      return;
    }
    try {
      await requestSwap({
        requesterScheduleId,
        counterpartEmployeeId,
        counterpartScheduleId: counterpartScheduleId || null,
        reason: reason.trim() || null,
      }).unwrap();
      showSuccess("Swap request sent.");
      navigate(ROUTES.HR_SHIFTS_SWAPS);
    } catch (err) {
      showApiError(err);
    }
  }

  if (mine.isLoading || employees.isLoading) return <Loading />;

  const mySchedules = mine.data?.data ?? [];

  const fmt = (s: {
    scheduledDate: string;
    isOffDay: boolean;
    plannedStart: string | null;
    plannedEnd: string | null;
  }) =>
    `${s.scheduledDate.slice(0, 10)} · ${s.isOffDay ? "OFF" : `${s.plannedStart} – ${s.plannedEnd}`}`;

  if (mySchedules.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Request a swap"
          description="Offer one of your shifts, pick a counterpart, add a reason."
        />
        <Empty
          title="No upcoming shifts"
          message="Swaps need a future scheduled shift. Ask your manager to add you to the roster."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Request a swap"
        description="Offer one of your shifts and pick a counterpart. A return shift is optional."
      />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
          <Select
            label="My shift to offer"
            value={requesterScheduleId}
            onValueChange={(v) => setRequesterScheduleId(v as string)}
            placeholder="Select a shift…"
            options={mySchedules.map((s) => ({ value: s.id, label: fmt(s) }))}
          />

          <Select
            label="Counterpart"
            value={counterpartEmployeeId}
            onValueChange={(v) => {
              setCounterpartEmployeeId(v as string);
              setCounterpartScheduleId("");
            }}
            placeholder="Select an employee…"
            searchable
            options={(employees.data?.data ?? []).map((emp) => ({
              value: emp.id,
              label: `${emp.firstName} ${emp.lastName} (${emp.employeeCode})`,
            }))}
          />

          <div>
            <Select
              label="Return shift (optional)"
              value={counterpartScheduleId}
              onValueChange={(v) => setCounterpartScheduleId(v as string)}
              disabled={!counterpartEmployeeId || counterpart.isLoading}
              placeholder="None (give-away)"
              clearable
              options={(counterpart.data?.data ?? []).map((s) => ({
                value: s.id,
                label: fmt(s),
              }))}
            />
            {counterpartEmployeeId && counterpart.isError && (
              <span className="text-xs text-amber-600 dark:text-amber-300">
                Couldn&apos;t load their shifts — continuing as a give-away.
              </span>
            )}
          </div>

          <label className="block">
            <span className="text-sm text-slate-700 dark:text-slate-200">Reason (optional)</span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Family event, appointment…"
              maxLength={2000}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(ROUTES.HR_SHIFTS_SWAPS)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isLoading}>
              Send request
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
