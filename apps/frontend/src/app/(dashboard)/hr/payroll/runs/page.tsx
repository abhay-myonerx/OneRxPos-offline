// Payroll runs list — the entry point for processing a pay period.
//
// A payroll run moves through a linear state machine:
//   DRAFT → (process) → PROCESSING → REVIEW → (approve) → APPROVED → (pay) → PAID
// FAILED and CANCELLED are terminal error states reachable from DRAFT/REVIEW.
//
// This page handles the DRAFT-level actions (create + process + cancel).
// Per-run approval and disbursement live on the run detail page.
"use client";

import { useState } from "react";
import { Link } from "@/shell/nav";
import { Plus, Play, Eye, Ban, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import {
  useListPayrollRunsQuery,
  useCreatePayrollRunMutation,
  useProcessPayrollRunMutation,
  useCancelPayrollRunMutation,
} from "@/features/hr/api/payroll.api";
import type {
  CreatePayrollRunInput,
  PayrollRun,
  PayrollRunStatus,
  PayCycle,
} from "@/features/hr/types/payroll.types";
import { RUN_STATUS_VARIANT } from "@/features/hr/types/payroll.types";
import { format } from "date-fns";

const EMPTY: CreatePayrollRunInput = {
  name: "",
  periodStart: "",
  periodEnd: "",
  payCycle: "MONTHLY",
  storeId: null,
};
// PROCESSING and APPROVED are excluded: cancelling a run that is mid-compute
// or has already been approved would leave payslips in an inconsistent state.
const CANCELLABLE = new Set<PayrollRunStatus>(["DRAFT", "REVIEW", "FAILED"]);
const STATUSES: PayrollRunStatus[] = [
  "DRAFT",
  "PROCESSING",
  "REVIEW",
  "APPROVED",
  "PAID",
  "CANCELLED",
  "FAILED",
];

export default function PayrollRunsPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny(
    "hr.payroll.read",
    "hr.payroll.run.create",
    "hr.payroll.run.process",
    "hr.payroll.run.approve",
    "hr.payroll.run.disburse",
    "hr.payroll.run.cancel",
  );
  const canCreate = can("hr.payroll.run.create");
  const canProcess = can("hr.payroll.run.process");
  const canCancel = can("hr.payroll.run.cancel");

  const [statusFilter, setStatusFilter] = useState<PayrollRunStatus | "">("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form, setForm] = useState<CreatePayrollRunInput>(EMPTY);
  const [cancelTarget, setCancelTarget] = useState<PayrollRun | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data, isLoading, isError, refetch } = useListPayrollRunsQuery(
    { status: statusFilter || undefined },
    { skip: !canRead },
  );
  const [create, { isLoading: creating }] = useCreatePayrollRunMutation();
  const [process, { isLoading: processing }] = useProcessPayrollRunMutation();
  const [cancel, { isLoading: cancelling }] = useCancelPayrollRunMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view payroll runs."
        missingPermission="hr.payroll.read"
      />
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create(form).unwrap();
      showSuccess("Run created");
      setCreateModalOpen(false);
      setForm(EMPTY);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleProcess(runId: string) {
    try {
      await process(runId).unwrap();
      showSuccess("Processing started");
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await cancel({
        id: cancelTarget.id,
        reason: cancelReason || undefined,
      }).unwrap();
      showSuccess("Run cancelled");
      setCancelTarget(null);
      setCancelReason("");
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Payroll runs"
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setForm(EMPTY);
                setCreateModalOpen(true);
              }}
              icon={<Plus className="h-4 w-4" />}
            >
              New run
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6" padding={false}>
        <div className="p-4 sm:max-w-xs">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as string as PayrollRunStatus | "")}
            placeholder="All statuses"
            clearable
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load payroll runs." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No runs yet"
          message={canCreate ? "Create your first run." : "No runs available."}
          action={
            canCreate ? (
              <Button onClick={() => setCreateModalOpen(true)} icon={<Plus className="h-4 w-4" />}>
                New run
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Cycle</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      <Link
                        href={`${ROUTES.HR_PAYROLL_RUNS}/${run.id}`}
                        className="hover:text-primary-700"
                      >
                        {run.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">
                      {format(new Date(run.periodStart), "dd MMM")} –{" "}
                      {format(new Date(run.periodEnd), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{run.payCycle}</td>
                    <td className="px-4 py-3">
                      <Badge variant={RUN_STATUS_VARIANT[run.status]}>{run.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {format(new Date(run.createdAt), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          icon={<Eye className="h-4 w-4" />}
                        >
                          <Link href={`${ROUTES.HR_PAYROLL_RUNS}/${run.id}`}>View</Link>
                        </Button>
                        {canProcess && run.status === "DRAFT" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcess(run.id)}
                            loading={processing}
                            icon={<Play className="h-4 w-4" />}
                          >
                            Process
                          </Button>
                        )}
                        {canProcess && run.status === "FAILED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleProcess(run.id)}
                            loading={processing}
                            icon={<RefreshCw className="h-4 w-4" />}
                          >
                            Retry
                          </Button>
                        )}
                        {canCancel && CANCELLABLE.has(run.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setCancelTarget(run);
                              setCancelReason("");
                            }}
                            icon={<Ban className="h-4 w-4" />}
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
          </div>
        </Card>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="New run">
        <form onSubmit={handleCreate} className="space-y-4">
          <FormField label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={150}
              placeholder="May 2026 Monthly"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Period start" required>
              <Input
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Period end" required>
              <Input
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                required
                min={form.periodStart}
              />
            </FormField>
          </div>
          <FormField label="Pay cycle">
            <Select
              value={form.payCycle}
              onValueChange={(v) => setForm({ ...form, payCycle: v as PayCycle })}
              options={[
                { value: "MONTHLY", label: "Monthly" },
                { value: "BIWEEKLY", label: "Biweekly" },
                { value: "WEEKLY", label: "Weekly" },
              ]}
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" type="button" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Cancel run">
        <div className="space-y-4">
          <FormField label="Reason (optional)">
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={500}
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Keep
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={cancelling}>
              Cancel run
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
