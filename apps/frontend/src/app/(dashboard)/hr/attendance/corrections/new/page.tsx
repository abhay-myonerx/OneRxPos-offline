"use client";

// HR — Submit a new attendance correction request. Self-service by
// default; HR/admin can submit on behalf of an employee (the backend
// route enforces `hr.attendance.regularize.request` for that path).

import { useState } from "react";
import { useNavigate } from "@/shell/nav";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/container";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { ErrorDisplay } from "@/components/shared/feedback/Error";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import { useCreateCorrectionMutation } from "@/features/hr/api/attendance.api";
import { CHECK_EVENT_TYPES, type CheckEventType } from "@/features/hr/types/attendance.types";
import { useListEmployeesQuery } from "@/features/hr/api/employees.api";

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewCorrectionPage() {
  const navigate = useNavigate();
  const { canAny, can } = usePermissions();
  const canRequest = canAny("ess.attendance.regularize", "hr.attendance.regularize.request");
  const canRequestForOthers = can("hr.attendance.regularize.request");

  const [employeeId, setEmployeeId] = useState<string>("");
  const [requestedDate, setRequestedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState<CheckEventType>("CHECK_IN");
  const [requestedTime, setRequestedTime] = useState<string>(toDatetimeLocal(new Date()));
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const [create, { isLoading: creating }] = useCreateCorrectionMutation();

  const employees = useListEmployeesQuery(
    { limit: 100, archived: "active" },
    { skip: !canRequestForOthers },
  );

  if (!canRequest) {
    return (
      <PermissionDenied
        title="You don't have permission to request attendance corrections."
        missingPermission="ess.attendance.regularize"
      />
    );
  }

  // Surface a retryable error if the (HR-only) employee picker fails to load
  // instead of leaving the form silently without options.
  if (canRequestForOthers && employees.isError) {
    return <ErrorDisplay message="Failed to load employees." onRetry={() => employees.refetch()} />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Reason is required (≥ 3 characters).",
          },
        },
      });
      return;
    }
    try {
      await create({
        employeeId: employeeId || null,
        requestedDate: new Date(requestedDate).toISOString(),
        eventType,
        requestedTime: new Date(requestedTime).toISOString(),
        reason: reason.trim(),
        evidenceUrl: evidenceUrl || null,
      }).unwrap();
      showSuccess("Correction submitted for approval");
      navigate(ROUTES.HR_ATTENDANCE_CORRECTIONS);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Request attendance correction"
        description="Submit a missed or wrong punch for manager approval."
        breadcrumbs={[
          { label: "Attendance", href: ROUTES.HR_ATTENDANCE },
          {
            label: "Corrections",
            href: ROUTES.HR_ATTENDANCE_CORRECTIONS,
          },
          { label: "New" },
        ]}
      />

      <form onSubmit={handleSubmit}>
        <Card className="max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {canRequestForOthers && (
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500 dark:text-slate-400">Employee</label>
                <Select
                  className="mt-1"
                  value={employeeId}
                  onValueChange={(v) => setEmployeeId(v as string)}
                  placeholder="Myself"
                  clearable
                  searchable
                  options={(employees.data?.data ?? []).map((emp) => ({
                    value: emp.id,
                    label: `${emp.firstName} ${emp.lastName} (${emp.employeeCode})`,
                  }))}
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Date</label>
              <Input
                type="date"
                required
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs text-slate-500 dark:text-slate-400">Event type</label>
              <Select
                className="mt-1"
                value={eventType}
                onValueChange={(v) => setEventType(v as CheckEventType)}
                options={CHECK_EVENT_TYPES.map((t) => ({
                  value: t,
                  label: t.replace(/_/g, " "),
                }))}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Corrected timestamp
              </label>
              <Input
                type="datetime-local"
                required
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">Reason</label>
              <Textarea
                required
                placeholder="What happened? e.g. forgot to clock in due to power outage."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Evidence URL (optional)
              </label>
              <Input
                type="url"
                placeholder="https://..."
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(ROUTES.HR_ATTENDANCE_CORRECTIONS)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Submit request
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
