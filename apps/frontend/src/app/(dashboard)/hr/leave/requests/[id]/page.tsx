"use client";

// HR — Leave Request detail page.
//
// Reached from the "New leave request" notification deep-link
// (`/hr/leave/requests/:id`) and from any future row link. Shows the full
// request and lets an approver Approve/Reject a PENDING request inline.
//
// Backed by `GET /api/v2/hr/leave/requests/:id` (read) and the
// approve/reject endpoints. Permission is enforced by the backend; the
// frontend gates the actions for UX only.

import { Link, useParams } from "@/shell/nav";
import { useState } from "react";
import { ArrowLeft, CheckCircle, XCircle, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { formatDate } from "@/lib/date/format-date";
import { ROUTES } from "@/constants/routes";

import {
  useGetLeaveRequestQuery,
  useApproveLeaveRequestMutation,
  useRejectLeaveRequestMutation,
  useListLeaveTypesQuery,
} from "@/features/hr/api/leave.api";
import { LEAVE_STATUS_LABELS, LEAVE_STATUS_VARIANTS } from "@/features/hr/types/leave.types";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

export default function LeaveRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const { canAny } = usePermissions();
  const canRead = canAny(
    "hr.leave.request.read.own",
    "hr.leave.request.read.team",
    "hr.leave.request.read.all",
    "ess.leave.request.read",
  );
  const canApprove = canAny("hr.leave.request.approve", "hr.leave.request.reject");

  const {
    data: request,
    isLoading,
    isError,
    refetch,
  } = useGetLeaveRequestQuery(id, {
    skip: !canRead || !id,
  });

  // Fetch all active leave types to resolve the name.  The request detail
  // endpoint returns only the leaveTypeId (not the full nested object) when
  // the requester doesn't have hr.leave.types.read, so we fall back gracefully.
  // Resolve the leave-type name (the request endpoint returns the id only).
  const { data: typesData } = useListLeaveTypesQuery({ isActive: true }, { skip: !canRead });

  const [approveRequest, { isLoading: approving }] = useApproveLeaveRequestMutation();
  const [rejectRequest, { isLoading: rejecting }] = useRejectLeaveRequestMutation();

  const [decisionAction, setDecisionAction] = useState<"approve" | "reject" | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view this leave request."
        missingPermission="ess.leave.request.read"
      />
    );
  }

  async function handleDecision() {
    if (!decisionAction || !request) return;
    try {
      if (decisionAction === "approve") {
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
      setDecisionAction(null);
      setDecisionNotes("");
    } catch (err) {
      showApiError(err);
    }
  }

  const leaveTypeName =
    request?.leaveType?.name ??
    typesData?.data.find((t) => t.id === request?.leaveTypeId)?.name ??
    (request ? request.leaveTypeId.slice(0, 8) + "…" : "");

  return (
    <>
      <Link
        href={ROUTES.HR_LEAVE_REQUESTS}
        className="inline-flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to requests
      </Link>

      <PageHeader
        title="Leave Request"
        description="Review the request details and record your decision."
      />

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load this leave request." onRetry={refetch} />
      ) : !request ? (
        <Empty
          title="Leave request not found"
          message="This request may have been removed, or you don't have access to it."
        />
      ) : (
        <Card className="max-w-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {leaveTypeName}
                {request.isHalfDay && (
                  <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                    (½ day)
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {formatDate(request.startDate)} → {formatDate(request.endDate)} ·{" "}
                {request.totalDays} day(s)
              </p>
            </div>
            <Badge variant={LEAVE_STATUS_VARIANTS[request.status]}>
              {LEAVE_STATUS_LABELS[request.status]}
            </Badge>
          </div>

          <dl className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2">
            <DetailRow label="Employee">
              {request.employee ? (
                <span>
                  {request.employee.firstName} {request.employee.lastName}
                  <span className="ml-1.5 font-mono text-xs text-slate-400 dark:text-slate-500">
                    {request.employee.employeeCode}
                  </span>
                </span>
              ) : (
                <span className="font-mono text-xs">{request.employeeId.slice(0, 8)}…</span>
              )}
            </DetailRow>
            <DetailRow label="Balance impact">{request.balanceImpactDays} day(s)</DetailRow>
            <DetailRow label="Submitted">{new Date(request.createdAt).toLocaleString()}</DetailRow>
            <DetailRow label="Decided">
              {request.decidedAt ? new Date(request.decidedAt).toLocaleString() : "—"}
            </DetailRow>
            <DetailRow label="Reason">{request.reason || "—"}</DetailRow>
            <DetailRow label="Decision notes">{request.decisionNotes || "—"}</DetailRow>
            {request.documentUrl && (
              <DetailRow label="Supporting document">
                <a
                  href={request.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[#4263eb] hover:underline"
                >
                  <FileText className="h-4 w-4" />
                  View document
                </a>
              </DetailRow>
            )}
          </dl>

          {canApprove && request.status === "PENDING" && (
            <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <Button
                variant="danger"
                icon={<XCircle className="h-4 w-4" />}
                onClick={() => {
                  setDecisionAction("reject");
                  setDecisionNotes("");
                }}
              >
                Reject
              </Button>
              <Button
                icon={<CheckCircle className="h-4 w-4" />}
                onClick={() => {
                  setDecisionAction("approve");
                  setDecisionNotes("");
                }}
              >
                Approve
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Approve / Reject modal */}
      <Modal
        open={decisionAction !== null}
        onClose={() => setDecisionAction(null)}
        title={decisionAction === "approve" ? "Approve leave request" : "Reject leave request"}
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
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="outline" type="button" onClick={() => setDecisionAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleDecision}
              loading={approving || rejecting}
              variant={decisionAction === "approve" ? "primary" : "danger"}
            >
              {decisionAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
