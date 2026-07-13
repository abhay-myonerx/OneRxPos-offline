"use client";

import { Link } from "@/shell/nav";
import { format } from "date-fns";
import { Plus, Ban } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useListEssLeaveBalancesQuery,
  useListEssLeaveRequestsQuery,
  useCancelEssLeaveMutation,
} from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import { useState } from "react";
import type { LeaveRequest } from "@/features/ess/types/ess.types";

const STATUS_VARIANT: Record<string, "warning" | "success" | "danger" | "outline"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "outline",
  CANCELLED_POST: "outline",
};

export default function EssLeavePage() {
  const { canAny } = usePermissions();
  const canRead = canAny("ess.leave.balance.read", "ess.leave.request.read");
  const canApply = canAny("ess.leave.request.create");

  const { data: balData, isLoading: balLoading } = useListEssLeaveBalancesQuery(undefined, {
    skip: !canRead,
  });
  const {
    data: reqData,
    isLoading,
    isError,
    error,
  } = useListEssLeaveRequestsQuery({ page: 1, limit: 30 }, { skip: !canRead });
  const [cancel, cancelState] = useCancelEssLeaveMutation();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function handleCancel() {
    if (!confirmId) return;
    try {
      await cancel(confirmId).unwrap();
      showSuccess("Leave request cancelled");
      setConfirmId(null);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
            My Leave
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            See your balance and apply for leave.
          </p>
        </div>
        {canApply && (
          <Button variant="primary" leftIcon={<Plus className="h-4 w-4" />} asChild>
            <Link href={ROUTES.ESS_LEAVE_APPLY}>Apply for leave</Link>
          </Button>
        )}
      </div>

      {/* Balance section — stat cards */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">Balances</h2>
        {balLoading ? (
          <Card className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading…</Card>
        ) : balData && balData.data.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balData.data.map((b) => (
              <Card
                key={b.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center"
              >
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                  {b.leaveType?.name ?? "—"}
                </div>
                <div className="text-2xl font-bold text-[#4263eb]">
                  {Number(b.availableDays).toFixed(1)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  days available
                </div>
                <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Used {Number(b.usedDays).toFixed(1)} · Pending {Number(b.pendingDays).toFixed(1)}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
            No leave balance has been allocated yet.
          </Card>
        )}
      </div>

      {/* Requests list */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          My requests
        </h2>
        <EssStateGate
          isLoading={isLoading}
          isError={isError}
          error={error}
          data={reqData}
          permissionDenied={!canRead}
          missingPermission="ess.leave.request.read"
          isEmpty={(d) => d.data.length === 0}
          emptyTitle="No leave requests"
          emptyMessage="You haven't applied for any leave yet."
        >
          {(d) => (
            <Card className="overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {d.data.map((r: LeaveRequest) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100 text-sm">
                        {r.leaveType?.name ?? "—"}
                        {r.isHalfDay && (
                          <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">
                            (half-day)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {format(new Date(r.startDate), "MMM d")} –{" "}
                        {format(new Date(r.endDate), "MMM d, yyyy")} ·{" "}
                        {Number(r.totalDays).toFixed(1)} days
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.status}</Badge>
                      {(r.status === "PENDING" || r.status === "APPROVED") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Ban className="h-3 w-3" />}
                          onClick={() => setConfirmId(r.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </EssStateGate>
      </div>

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={handleCancel}
        title="Cancel leave request?"
        description="If this request was already approved and is in the future, your leave balance will be refunded."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        loading={cancelState.isLoading}
        variant="warning"
      />
    </div>
  );
}
