"use client";

// HR — Attendance corrections queue.
//
// Renders the caller-visible corrections (scope=self for employees,
// scope=team for managers, scope=all for HR/admin), with approve /
// reject actions for managers and cancel for the requesting employee.

import { useMemo, useState } from "react";
import { Link } from "@/shell/nav";
import { CheckCircle2, FileText, Plus, XCircle, Ban } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";

import {
  useListCorrectionsQuery,
  useApproveCorrectionMutation,
  useRejectCorrectionMutation,
  useCancelCorrectionMutation,
} from "@/features/hr/api/attendance.api";
import {
  CORRECTION_STATUSES,
  type AttendanceCorrection,
  type AttendanceCorrectionStatus,
  type AttendanceScope,
} from "@/features/hr/types/attendance.types";

function statusVariant(s: AttendanceCorrectionStatus) {
  switch (s) {
    case "APPROVED":
      return "success" as const;
    case "REJECTED":
      return "danger" as const;
    case "CANCELLED":
      return "outline" as const;
    case "PENDING":
    default:
      return "warning" as const;
  }
}

export default function CorrectionsPage() {
  const { canAny } = usePermissions();
  const canRead = canAny(
    "ess.attendance.regularize",
    "hr.attendance.regularize.request",
    "hr.attendance.regularize.approve",
    "hr.attendance.read.all",
  );
  const canApprove = canAny("hr.attendance.regularize.approve");
  // The backend models approve and reject as separate permissions so a role can
  // be restricted to approval-only (e.g. a supervisor who escalates rejects).
  // Gate each button independently to match.
  const canReject = canAny("hr.attendance.regularize.reject");
  const canRequestOwn = canAny("ess.attendance.regularize", "hr.attendance.regularize.request");
  const canReadAll = canAny("hr.attendance.read.all");
  const canReadTeam = canAny("hr.attendance.read.team", "hr.attendance.regularize.approve");

  const initialScope: AttendanceScope = canReadAll ? "all" : canReadTeam ? "team" : "self";
  const [scope, setScope] = useState<AttendanceScope>(initialScope);
  const [status, setStatus] = useState<AttendanceCorrectionStatus | "">("PENDING");
  const [page, setPage] = useState(1);

  const list = useListCorrectionsQuery(
    {
      scope,
      status: status || undefined,
      page,
      limit: 20,
    },
    { skip: !canRead },
  );

  const [approve, { isLoading: approving }] = useApproveCorrectionMutation();
  const [reject, { isLoading: rejecting }] = useRejectCorrectionMutation();
  const [cancel, { isLoading: cancelling }] = useCancelCorrectionMutation();

  const [approveTarget, setApproveTarget] = useState<AttendanceCorrection | null>(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AttendanceCorrection | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [cancelTarget, setCancelTarget] = useState<AttendanceCorrection | null>(null);

  async function handleApprove() {
    if (!approveTarget) return;
    try {
      await approve({
        id: approveTarget.id,
        data: { managerNotes: approveNotes || null },
      }).unwrap();
      showSuccess("Correction approved");
      setApproveTarget(null);
      setApproveNotes("");
    } catch (err) {
      showApiError(err);
    }
  }
  async function handleReject() {
    if (!rejectTarget) return;
    try {
      await reject({
        id: rejectTarget.id,
        data: { managerNotes: rejectNotes || null },
      }).unwrap();
      showSuccess("Correction rejected");
      setRejectTarget(null);
      setRejectNotes("");
    } catch (err) {
      showApiError(err);
    }
  }
  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await cancel(cancelTarget.id).unwrap();
      showSuccess("Correction cancelled");
      setCancelTarget(null);
    } catch (err) {
      showApiError(err);
    }
  }

  const rows = useMemo(() => list.data?.data ?? [], [list.data]);

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view attendance corrections."
        missingPermission="ess.attendance.regularize"
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Attendance corrections"
        description="Submit a missed punch, or approve / reject requests from your team."
        breadcrumbs={[
          { label: "Attendance", href: ROUTES.HR_ATTENDANCE },
          { label: "Corrections" },
        ]}
        actions={
          canRequestOwn ? (
            <Link href={ROUTES.HR_ATTENDANCE_CORRECTIONS_NEW}>
              <Button icon={<Plus className="h-4 w-4" />}>Request correction</Button>
            </Link>
          ) : null
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as string as AttendanceCorrectionStatus | "");
              setPage(1);
            }}
            placeholder="All statuses"
            clearable
            options={CORRECTION_STATUSES.map((s) => ({
              value: s,
              label: s,
            }))}
          />
          <Select
            value={scope}
            onValueChange={(v) => {
              setScope(v as AttendanceScope);
              setPage(1);
            }}
            options={[
              { value: "self", label: "Mine" },
              ...(canReadTeam || canReadAll ? [{ value: "team", label: "Team" }] : []),
              ...(canReadAll ? [{ value: "all", label: "All" }] : []),
            ]}
          />
        </div>
      </Card>

      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorDisplay message="Failed to load corrections" onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <Empty
          title="No corrections"
          message="Nothing matches the current filters."
          icon={<FileText className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500 dark:text-slate-400 border-b">
                <tr>
                  <th className="py-3 px-3 font-medium">Employee</th>
                  <th className="py-3 px-3 font-medium">Date</th>
                  <th className="py-3 px-3 font-medium">Event</th>
                  <th className="py-3 px-3 font-medium">Requested time</th>
                  <th className="py-3 px-3 font-medium">Reason</th>
                  <th className="py-3 px-3 font-medium">Status</th>
                  <th className="py-3 px-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="py-3 px-3">
                      {r.employee
                        ? `${r.employee.firstName} ${r.employee.lastName}`
                        : r.employeeId.slice(0, 8)}
                      {r.employee && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                          ({r.employee.employeeCode})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">{new Date(r.requestedDate).toLocaleDateString()}</td>
                    <td className="py-3 px-3">
                      <Badge variant="outline">{r.eventType.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="py-3 px-3">
                      {new Date(r.requestedTime).toLocaleString([], {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-[24rem]">
                      {r.reason}
                      {r.managerNotes && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          Manager: {r.managerNotes}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {r.status === "PENDING" ? (
                        <div className="flex flex-wrap gap-2 justify-end">
                          {canApprove && (
                            <Button
                              size="sm"
                              icon={<CheckCircle2 className="h-4 w-4" />}
                              onClick={() => setApproveTarget(r)}
                            >
                              Approve
                            </Button>
                          )}
                          {canReject && (
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<XCircle className="h-4 w-4" />}
                              onClick={() => setRejectTarget(r)}
                            >
                              Reject
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Ban className="h-4 w-4" />}
                            onClick={() => setCancelTarget(r)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {list.data && list.data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-slate-500 dark:text-slate-400">
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
        </Card>
      )}

      {/* Approve modal — approving inserts a new regularized event rather than
          mutating the original punch; original records stay intact for the audit log. */}
      <Modal
        open={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        title="Approve correction"
        description="Approving creates a new immutable attendance record. The original punches are never edited."
        primaryAction={{
          label: "Approve",
          onClick: handleApprove,
          loading: approving,
        }}
        secondaryAction={{
          label: "Cancel",
          onClick: () => setApproveTarget(null),
          variant: "outline",
        }}
      >
        <div className="space-y-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Manager notes (optional)
          </label>
          <Textarea
            value={approveNotes}
            onChange={(e) => setApproveNotes(e.target.value)}
            rows={3}
          />
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject correction"
        description="The employee can re-submit if needed."
        primaryAction={{
          label: "Reject",
          onClick: handleReject,
          loading: rejecting,
          variant: "danger",
        }}
        secondaryAction={{
          label: "Cancel",
          onClick: () => setRejectTarget(null),
          variant: "outline",
        }}
      >
        <div className="space-y-2">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Manager notes (optional)
          </label>
          <Textarea value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={3} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel correction?"
        description="This withdraws your request. You can submit a fresh one if needed."
        confirmLabel="Cancel request"
        loading={cancelling}
        onConfirm={handleCancel}
        onClose={() => setCancelTarget(null)}
      />
    </>
  );
}
