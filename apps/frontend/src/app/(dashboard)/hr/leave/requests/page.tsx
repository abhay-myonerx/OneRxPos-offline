"use client";

// HR — Leave requests: unified ESS + manager view.
//
// Three tabs surface different slices of the same data:
//   "My requests"  — the logged-in employee's own submissions (scope=self)
//   "Team queue"   — PENDING requests from direct reports (scope=team)
//   "Apply"        — inline submission form (avoids a separate page hop)
//
// The badge count on the "Team queue" tab is fetched independently so it
// stays current even while the user is viewing another tab.
//
// Balance formula shown to the employee:
//   available = entitled + carried − used − pending
// "pending" is already reserved the moment a request is submitted, so the
// employee sees the real remaining headroom without needing HR to approve first.

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle, Plus, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { formatDate } from "@/lib/date/format-date";

import {
  useListLeaveRequestsQuery,
  useCreateLeaveRequestMutation,
  useApproveLeaveRequestMutation,
  useRejectLeaveRequestMutation,
  useCancelLeaveRequestMutation,
  useListLeaveTypesQuery,
  useListLeaveBalancesQuery,
} from "@/features/hr/api/leave.api";
import type {
  CreateLeaveRequestInput,
  LeaveRequest,
  LeaveRequestStatus,
} from "@/features/hr/types/leave.types";
import {
  LEAVE_REQUEST_STATUSES,
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_VARIANTS,
} from "@/features/hr/types/leave.types";

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY_REQUEST: CreateLeaveRequestInput = {
  employeeId: null,
  leaveTypeId: "",
  startDate: TODAY,
  endDate: TODAY,
  isHalfDay: false,
  reason: "",
  documentUrl: null,
};

type ActiveTab = "my-requests" | "team-queue" | "apply";

export default function LeaveRequestsPage() {
  const { canAny } = usePermissions();

  const canRead = canAny(
    "hr.leave.request.read.own",
    "hr.leave.request.read.team",
    "hr.leave.request.read.all",
    "ess.leave.request.read",
  );
  const canApprove = canAny("hr.leave.request.approve", "hr.leave.request.reject");
  const canApply = canAny("ess.leave.request.create", "hr.leave.request.create.for");

  const [activeTab, setActiveTab] = useState<ActiveTab>("my-requests");
  const [statusFilter, setStatusFilter] = useState<LeaveRequestStatus | "">("");
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{
    request: LeaveRequest;
    action: "approve" | "reject";
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const [form, setForm] = useState<CreateLeaveRequestInput>(EMPTY_REQUEST);

  // "apply" renders an inline form, not a data list, so it reuses "self" scope
  // for the background balance fetch without making an extra list request.
  const scope: "self" | "team" = activeTab === "team-queue" ? "team" : "self";

  const listParams = useMemo(
    () => ({
      scope,
      status: (statusFilter || undefined) as LeaveRequestStatus | undefined,
    }),
    [scope, statusFilter],
  );

  const { data, isLoading, isError, refetch } = useListLeaveRequestsQuery(listParams, {
    skip: !canRead,
  });

  const { data: typesData } = useListLeaveTypesQuery({ isActive: true }, { skip: !canApply });

  const { data: balancesData } = useListLeaveBalancesQuery(
    { scope: "self", cycleYear: new Date().getFullYear() },
    { skip: !canApply },
  );

  const { data: pendingTeamData } = useListLeaveRequestsQuery(
    { scope: "team", status: "PENDING" },
    { skip: !canApprove },
  );
  const pendingTeamCount = pendingTeamData?.pagination.total ?? 0;

  const [createRequest, { isLoading: creating }] = useCreateLeaveRequestMutation();
  const [approveRequest, { isLoading: approving }] = useApproveLeaveRequestMutation();
  const [rejectRequest, { isLoading: rejecting }] = useRejectLeaveRequestMutation();
  const [cancelRequest, { isLoading: cancelling }] = useCancelLeaveRequestMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view leave requests."
        missingPermission="ess.leave.request.read"
      />
    );
  }

  const items = data?.data ?? [];
  const leaveTypes = typesData?.data ?? [];
  const balances = balancesData?.data ?? [];

  const selectedBalance = balances.find((b) => b.leaveTypeId === form.leaveTypeId);
  const selectedType = leaveTypes.find((t) => t.id === form.leaveTypeId);
  const requiresDocument = selectedType?.requiresDocument ?? false;

  function openApply() {
    setForm(EMPTY_REQUEST);
    setApplyModalOpen(true);
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!form.leaveTypeId) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "Please select a leave type.",
          },
        },
      });
      return;
    }
    // Client-side date guard to surface a friendly error before hitting the API.
    if (form.startDate > form.endDate) {
      showApiError({
        data: {
          error: {
            code: "VALIDATION_ERROR",
            message: "End date must be on or after start date.",
          },
        },
      });
      return;
    }
    try {
      await createRequest(form).unwrap();
      showSuccess("Leave request submitted");
      setApplyModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  function openDecision(request: LeaveRequest, action: "approve" | "reject") {
    setDecisionTarget({ request, action });
    setDecisionNotes("");
    setDecisionModalOpen(true);
  }

  async function handleDecision() {
    if (!decisionTarget) return;
    const { request, action } = decisionTarget;
    try {
      if (action === "approve") {
        await approveRequest({
          id: request.id,
          data: { decisionNotes: decisionNotes || null },
        }).unwrap();
        showSuccess("Request approved");
      } else {
        await rejectRequest({
          id: request.id,
          data: { decisionNotes: decisionNotes || null },
        }).unwrap();
        showSuccess("Request rejected");
      }
      setDecisionModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await cancelRequest(cancelTarget.id).unwrap();
      showSuccess("Request cancelled");
      setCancelTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  const tabs: { key: ActiveTab; label: string; show: boolean }[] = (
    [
      { key: "my-requests", label: "My requests", show: canApply },
      { key: "team-queue", label: "Team queue", show: canApprove },
      { key: "apply", label: "Apply for leave", show: canApply },
    ] satisfies { key: ActiveTab; label: string; show: boolean }[]
  ).filter((t) => t.show);

  return (
    <>
      <PageHeader
        title="Leave Requests"
        description="Apply for leave, track your requests, and manage your team's pending requests."
        actions={
          canApply ? (
            <Button onClick={openApply} icon={<Plus className="h-4 w-4" />}>
              Apply for leave
            </Button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActiveTab(t.key);
              setStatusFilter("");
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? "border-[#4263eb] text-[#4263eb]"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"
            }`}
          >
            {t.label}
            {t.key === "team-queue" && pendingTeamCount > 0 && (
              <span
                className="inline-flex min-w-[20px] h-5 items-center justify-center rounded-full bg-[#4263eb] px-1.5 text-[11px] font-semibold text-white"
                aria-label={`${pendingTeamCount} pending request${pendingTeamCount === 1 ? "" : "s"} awaiting your decision`}
              >
                {pendingTeamCount > 99 ? "99+" : pendingTeamCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: apply */}
      {activeTab === "apply" ? (
        <Card className="max-w-xl">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Submit a leave request
          </h2>
          <form onSubmit={handleApply} className="space-y-4">
            <FormField label="Leave type" required>
              <Select
                value={form.leaveTypeId}
                onValueChange={(v) => setForm({ ...form, leaveTypeId: v as string })}
                placeholder="— select —"
                searchable
                options={leaveTypes.map((t) => ({
                  value: t.id,
                  label: t.name,
                }))}
              />
            </FormField>

            {selectedBalance && (
              <p className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-2">
                Available balance:{" "}
                <strong className="text-[#4263eb]">{selectedBalance.availableDays} days</strong>{" "}
                (entitled {selectedBalance.entitledDays} + carried {selectedBalance.carriedDays} −
                used {selectedBalance.usedDays} − pending {selectedBalance.pendingDays})
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Start date" required>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </FormField>
              <FormField label="End date" required>
                <Input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                />
              </FormField>
            </div>

            {form.startDate === form.endDate && (
              <Checkbox
                label="Half-day"
                checked={form.isHalfDay ?? false}
                onChange={(e) => setForm({ ...form, isHalfDay: e.target.checked })}
              />
            )}

            <FormField label="Reason">
              <Input
                value={form.reason ?? ""}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                maxLength={1000}
                placeholder="Optional reason"
              />
            </FormField>

            {requiresDocument && (
              <FormField
                label="Document URL"
                required
                hint="This leave type requires supporting evidence (e.g. medical certificate)."
              >
                <Input
                  type="url"
                  value={form.documentUrl ?? ""}
                  onChange={(e) => setForm({ ...form, documentUrl: e.target.value || null })}
                  placeholder="https://…"
                  required
                />
              </FormField>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button type="submit" loading={creating}>
                Submit request
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <Card className="mb-6">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as string as LeaveRequestStatus | "")}
              placeholder="All statuses"
              clearable
              options={LEAVE_REQUEST_STATUSES.map((s) => ({
                value: s,
                label: LEAVE_STATUS_LABELS[s],
              }))}
            />
          </Card>

          {isLoading ? (
            <Loading />
          ) : isError ? (
            <ErrorDisplay message="Could not load leave requests." onRetry={refetch} />
          ) : items.length === 0 ? (
            <Empty
              title="No leave requests"
              message={
                activeTab === "team-queue"
                  ? "No pending requests from your team."
                  : "You haven't submitted any leave requests yet."
              }
              icon={<CalendarDays className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
              action={
                canApply ? (
                  <Button onClick={openApply} icon={<Plus className="h-4 w-4" />}>
                    Apply for leave
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500 dark:text-slate-400">
                    <th className="pb-3 pr-4 font-medium">Employee</th>
                    <th className="pb-3 pr-4 font-medium">Leave type</th>
                    <th className="pb-3 pr-4 font-medium">Dates</th>
                    <th className="pb-3 pr-4 font-medium">Days</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <LeaveRequestRow
                      key={r.id}
                      request={r}
                      showApprove={
                        activeTab === "team-queue" && canApprove && r.status === "PENDING"
                      }
                      showCancel={
                        activeTab === "my-requests" &&
                        (r.status === "PENDING" || r.status === "APPROVED")
                      }
                      onApprove={() => openDecision(r, "approve")}
                      onReject={() => openDecision(r, "reject")}
                      onCancel={() => setCancelTarget(r)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Apply modal (also opened from "Apply for leave" button in header) */}
      <Modal open={applyModalOpen} onClose={() => setApplyModalOpen(false)} title="Apply for leave">
        <form onSubmit={handleApply} className="space-y-4">
          <FormField label="Leave type" required>
            <Select
              value={form.leaveTypeId}
              onValueChange={(v) => setForm({ ...form, leaveTypeId: v as string })}
              placeholder="— select —"
              searchable
              options={leaveTypes.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
          </FormField>

          {selectedBalance && (
            <p className="text-sm bg-slate-50 dark:bg-slate-800/50 rounded-md px-3 py-2 text-slate-600 dark:text-slate-300">
              Available:{" "}
              <strong className="text-[#4263eb]">{selectedBalance.availableDays} days</strong>
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start date" required>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                required
              />
            </FormField>
            <FormField label="End date" required>
              <Input
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                required
              />
            </FormField>
          </div>

          {form.startDate === form.endDate && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.isHalfDay ?? false}
                onChange={(e) => setForm({ ...form, isHalfDay: e.target.checked })}
              />
              Half-day
            </label>
          )}

          <FormField label="Reason">
            <Input
              value={form.reason ?? ""}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              maxLength={1000}
              placeholder="Optional reason"
            />
          </FormField>

          {requiresDocument && (
            <FormField
              label="Document URL"
              required
              hint="This leave type requires supporting evidence (e.g. medical certificate)."
            >
              <Input
                type="url"
                value={form.documentUrl ?? ""}
                onChange={(e) => setForm({ ...form, documentUrl: e.target.value || null })}
                placeholder="https://…"
                required
              />
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setApplyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Submit request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Approve/Reject modal */}
      <Modal
        open={decisionModalOpen}
        onClose={() => setDecisionModalOpen(false)}
        title={
          decisionTarget?.action === "approve" ? "Approve leave request" : "Reject leave request"
        }
      >
        <div className="space-y-4">
          <FormField label="Notes (optional)">
            <Input
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder="Decision notes visible to the employee"
              maxLength={500}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setDecisionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDecision}
              loading={approving || rejecting}
              variant={decisionTarget?.action === "approve" ? "primary" : "danger"}
            >
              {decisionTarget?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel confirm */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title="Cancel this leave request?"
        description={
          cancelTarget
            ? // CANCELLED_POST is a distinct terminal status for already-approved
              // requests — the backend re-credits the consumed balance days on cancel.
              cancelTarget.status === "APPROVED"
              ? "This request has already been approved. Cancelling will mark it as CANCELLED_POST and restore your balance."
              : "Your pending request will be cancelled and the held balance will be released."
            : ""
        }
        confirmLabel="Cancel request"
        variant="warning"
        loading={cancelling}
      />
    </>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

interface RowProps {
  request: LeaveRequest;
  showApprove: boolean;
  showCancel: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}

/**
 * Renders a leave window as a human-friendly range.
 * Same day → "Jun 16, 2026"; otherwise "Jun 08 → Jun 09, 2026".
 */
function formatLeaveRange(startDate: string, endDate: string): string {
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  if (start === end) return start;
  // Drop the year from the start label when both ends share it to keep the
  // range compact (e.g. "Jun 08 → Jun 09, 2026").
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  const startLabel = startYear === endYear ? formatDate(startDate, "MMM dd") : start;
  return `${startLabel} → ${end}`;
}

function LeaveRequestRow({
  request: r,
  showApprove,
  showCancel,
  onApprove,
  onReject,
  onCancel,
}: RowProps) {
  return (
    <tr className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <td className="py-3 pr-4">
        {r.employee ? (
          <div className="min-w-0">
            <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
              {r.employee.firstName} {r.employee.lastName}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{r.employee.employeeCode}</p>
          </div>
        ) : (
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {r.employeeId.slice(0, 8)}…
          </span>
        )}
      </td>
      <td className="py-3 pr-4">
        <span className="inline-flex items-center gap-2">
          {r.leaveType?.color && (
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: r.leaveType.color }}
            />
          )}
          {r.leaveType?.name ?? r.leaveTypeId.slice(0, 8)}
        </span>
      </td>
      <td className="py-3 pr-4 whitespace-nowrap">
        {formatLeaveRange(r.startDate, r.endDate)}
        {r.isHalfDay && (
          <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(½ day)</span>
        )}
      </td>
      <td className="py-3 pr-4">{r.totalDays}</td>
      <td className="py-3 pr-4">
        <Badge variant={LEAVE_STATUS_VARIANTS[r.status]}>{LEAVE_STATUS_LABELS[r.status]}</Badge>
      </td>
      <td className="py-3">
        <div className="flex gap-1">
          {showApprove && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onApprove}
                icon={<CheckCircle className="h-4 w-4 text-green-600 dark:text-green-300" />}
                title="Approve"
              >
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReject}
                icon={<XCircle className="h-4 w-4 text-red-500" />}
                title="Reject"
              >
                Reject
              </Button>
            </>
          )}
          {showCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
