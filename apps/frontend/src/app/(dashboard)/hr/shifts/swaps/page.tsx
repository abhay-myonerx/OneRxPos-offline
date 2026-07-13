"use client";

import { useMemo, useState } from "react";
import { Link } from "@/shell/nav";
import { Check, Plus, RefreshCw, ThumbsDown, ThumbsUp, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  useApproveSwapMutation,
  useCancelSwapMutation,
  useListSwapsQuery,
  useRespondSwapMutation,
} from "@/features/hr/api/shifts.api";
import type {
  ShiftSwapRequest,
  ShiftSwapStatus,
  SwapListParams,
} from "@/features/hr/types/shift.types";

type Tab = "mine" | "incoming" | "to-approve" | "all";

const STATUS_VARIANT: Record<
  ShiftSwapStatus,
  "default" | "success" | "warning" | "danger" | "outline"
> = {
  PENDING_PEER: "warning",
  PENDING_MANAGER: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "outline",
  EXPIRED: "outline",
};

export default function SwapInboxPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny(
    "hr.shifts.swap.request.own",
    "hr.shifts.swap.respond",
    "hr.shifts.swap.approve",
    "ess.shifts.swap.request",
    "ess.shifts.swap.respond",
  );
  const canApprove = can("hr.shifts.swap.approve");
  // Only employees who can list the employee directory can start a swap —
  // the new-swap form needs hr.employees.read to populate the counterpart
  // picker. Pure-ESS respondents still reach the inbox and can accept/reject.
  const canRequest = can("hr.shifts.swap.request.own");

  const [tab, setTab] = useState<Tab>("mine");
  const [decideOpen, setDecideOpen] = useState<{
    swap: ShiftSwapRequest;
    approve: boolean;
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");

  const params = useMemo<SwapListParams>(
    () => ({
      scope: tab === "all" ? "all" : tab,
      limit: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
    }),
    [tab],
  );

  const { data, isLoading, isError, refetch } = useListSwapsQuery(params, {
    skip: !canRead,
  });

  const [respond, { isLoading: responding }] = useRespondSwapMutation();
  const [approve, { isLoading: approving }] = useApproveSwapMutation();
  const [cancel, { isLoading: cancelling }] = useCancelSwapMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view shift swaps."
        missingPermission="hr.shifts.swap.respond"
      />
    );
  }

  const items = data?.data ?? [];

  async function handleRespond(id: string, accept: boolean) {
    try {
      await respond({ id, data: { accept } }).unwrap();
      showSuccess(accept ? "Swap accepted — pending manager approval." : "Swap rejected.");
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleApprove() {
    if (!decideOpen) return;
    try {
      await approve({
        id: decideOpen.swap.id,
        data: {
          approve: decideOpen.approve,
          decisionNotes: decisionNotes.trim() || null,
        },
      }).unwrap();
      showSuccess(decideOpen.approve ? "Swap approved." : "Swap rejected.");
      setDecideOpen(null);
      setDecisionNotes("");
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancel(id).unwrap();
      showSuccess("Swap request cancelled.");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shift swap requests"
        description="Two-step workflow: peer acceptance, then manager approval. Approval atomically reassigns the rostered template between the two schedules."
        actions={
          canRequest && (
            <Link href={ROUTES.HR_SHIFTS_SWAPS_NEW}>
              <Button icon={<Plus className="h-4 w-4" />}>Request swap</Button>
            </Link>
          )
        }
      />

      <Card className="p-2 inline-flex flex-wrap gap-1">
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          Mine
        </TabButton>
        <TabButton active={tab === "incoming"} onClick={() => setTab("incoming")}>
          Incoming
        </TabButton>
        {canApprove && (
          <TabButton active={tab === "to-approve"} onClick={() => setTab("to-approve")}>
            To approve
          </TabButton>
        )}
        {canApprove && (
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All
          </TabButton>
        )}
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load swap requests." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="Nothing here"
          message="No swap requests in this view."
          icon={<RefreshCw className="h-10 w-10 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Requested</th>
                <th className="text-left px-3 py-2 font-medium">Requester</th>
                <th className="text-left px-3 py-2 font-medium">Counterpart</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
                <th className="text-left px-3 py-2 font-medium">Expires</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <div>{s.requesterEmployeeId}</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {s.requesterScheduleId}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <div>{s.counterpartEmployeeId}</div>
                    {s.counterpartScheduleId ? (
                      <div className="text-slate-500 dark:text-slate-400">
                        {s.counterpartScheduleId}
                      </div>
                    ) : (
                      <div className="text-amber-600 dark:text-amber-300">give-away</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-xs">
                    {s.reason ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {new Date(s.expiresAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex flex-wrap gap-1 justify-end">
                      {tab === "incoming" && s.status === "PENDING_PEER" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<ThumbsUp className="h-4 w-4" />}
                            onClick={() => handleRespond(s.id, true)}
                            disabled={responding}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<ThumbsDown className="h-4 w-4" />}
                            onClick={() => handleRespond(s.id, false)}
                            disabled={responding}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {canApprove && s.status === "PENDING_MANAGER" && (
                        <>
                          <Button
                            size="sm"
                            icon={<Check className="h-4 w-4" />}
                            onClick={() => {
                              setDecisionNotes("");
                              setDecideOpen({ swap: s, approve: true });
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<X className="h-4 w-4" />}
                            onClick={() => {
                              setDecisionNotes("");
                              setDecideOpen({ swap: s, approve: false });
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {(s.status === "PENDING_PEER" || s.status === "PENDING_MANAGER") &&
                        tab === "mine" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancel(s.id)}
                            disabled={cancelling}
                          >
                            Cancel
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={!!decideOpen}
        onClose={() => setDecideOpen(null)}
        title={decideOpen?.approve ? "Approve swap?" : "Reject swap?"}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {decideOpen?.approve
              ? // "Atomic" means both schedules are updated in a single transaction —
                // there is no window where one employee's record shows the swap and
                // the other's does not.
                "Approving will atomically swap the template + planned snapshot between the two schedules."
              : "Rejecting will close this swap; the original schedules stay as-is."}
          </p>
          <Textarea
            value={decisionNotes}
            onChange={(e) => setDecisionNotes(e.target.value)}
            placeholder="Optional notes for the audit log"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDecideOpen(null)} type="button">
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              loading={approving}
              variant={decideOpen?.approve ? "primary" : "danger"}
            >
              {decideOpen?.approve ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1.5 text-sm rounded-md transition-colors " +
        (active
          ? "bg-primary-500 text-white"
          : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")
      }
    >
      {children}
    </button>
  );
}
