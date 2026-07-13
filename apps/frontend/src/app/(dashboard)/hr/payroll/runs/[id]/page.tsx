"use client";

import { useState } from "react";
import { Link, useParams } from "@/shell/nav";
import { ArrowLeft, Lock, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Input } from "@/components/ui/input";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppSelector } from "@/store/hooks";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import {
  useGetPayrollRunQuery,
  useListPayslipsQuery,
  useProcessPayrollRunMutation,
  useApprovePayrollRunMutation,
  usePayPayrollRunMutation,
  useVoidPayslipMutation,
  useGetPayslipQuery,
} from "@/features/hr/api/payroll.api";
import { openPayslipPdf } from "@/features/hr/lib/openPayslipPdf";
import type { Payslip, PayrollRunStatus } from "@/features/hr/types/payroll.types";
import { PAYSLIP_FLAGS, COMPONENT_TYPE_VARIANT } from "@/features/hr/types/payroll.types";
import { format } from "date-fns";

const money = (v: string) => parseFloat(v).toFixed(2);

// ── Payroll run state machine ─────────────────────────────────────────────────
//
// Legal forward transitions:
//   DRAFT → (process) → PROCESSING → REVIEW  (or FAILED on error)
//   REVIEW → (approve) → APPROVED
//   APPROVED → (pay) → PAID
//   Any pre-PAID state → (cancel) → CANCELLED
//
// PROCESSING is transient (server-side async) — the stepper maps it to the
// REVIEW node so the UI reflects the conceptual state, not the DB polling state.
const STEPS: { label: string; status: PayrollRunStatus }[] = [
  { label: "Draft", status: "DRAFT" },
  { label: "Review", status: "REVIEW" },
  { label: "Approved", status: "APPROVED" },
  { label: "Paid", status: "PAID" },
];

function activeStep(status: PayrollRunStatus): number {
  switch (status) {
    case "DRAFT":
      return 0;
    case "PROCESSING":
    case "REVIEW":
    case "FAILED":
      return 1;
    case "APPROVED":
      return 2;
    case "PAID":
      return 3;
    default:
      return -1;
  }
}

function RunStepper({ status }: { status: PayrollRunStatus }) {
  const active = activeStep(status);
  const cancelled = status === "CANCELLED";
  const failed = status === "FAILED";

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const isLast = i === STEPS.length - 1;
        const done = !cancelled && i < active;
        const current = !cancelled && i === active;
        const node =
          current && failed ? "failed" : current ? "current" : done ? "done" : "upcoming";

        const circle =
          node === "done"
            ? "bg-primary-500 text-white"
            : node === "current"
              ? "bg-primary-500 text-white ring-4 ring-primary-100"
              : node === "failed"
                ? "bg-danger-500 text-white ring-4 ring-danger-100"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500";

        return (
          <div key={step.status} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${circle}`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span
                className={`mt-1.5 text-xs ${current ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                className={`mx-2 h-0.5 flex-1 rounded ${done ? "bg-primary-500" : "bg-slate-200 dark:bg-slate-700"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Payroll run detail — lifecycle stepper, payslip table, and action buttons.
//
// Three distinct permission levels gate the action bar:
//   canProcess   → Process / Re-process (DRAFT or FAILED → REVIEW)
//   canApprove   → Approve (REVIEW → APPROVED), blocked when sodWarning is true
//   canDisburse  → Mark Paid (APPROVED → PAID)
//
// Separation-of-duties (SoD): the same user must not process AND approve the
// same run. `sodWarning` is true when the approver would be approving their own
// processing work.
export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, canAny } = usePermissions();
  const canRead = canAny(
    "hr.payroll.read",
    "hr.payroll.run.process",
    "hr.payroll.run.approve",
    "hr.payroll.run.disburse",
  );
  const canProcess = can("hr.payroll.run.process");
  const canApprove = can("hr.payroll.run.approve");
  const canDisburse = can("hr.payroll.run.disburse");
  const canVoidPayslip = can("hr.payroll.payslip.void");
  const canManageActions = canProcess || canApprove || canDisburse;
  const userId = useAppSelector((s) => s.auth.user?.id);

  const [voidTarget, setVoidTarget] = useState<Payslip | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [detailPayslipId, setDetailPayslipId] = useState<string | null>(null);

  const {
    data: run,
    isLoading: loadingRun,
    isError,
  } = useGetPayrollRunQuery(id, {
    skip: !canRead,
  });
  const { data: payslipsData, isLoading: loadingPayslips } = useListPayslipsQuery(
    { runId: id },
    { skip: !canRead },
  );
  const { data: payslipDetail, isLoading: loadingDetail } = useGetPayslipQuery(
    { runId: id, pid: detailPayslipId! },
    { skip: !detailPayslipId },
  );

  const [process, { isLoading: processing }] = useProcessPayrollRunMutation();
  const [approve, { isLoading: approving }] = useApprovePayrollRunMutation();
  const [pay, { isLoading: paying }] = usePayPayrollRunMutation();
  const [voidPayslip, { isLoading: voiding }] = useVoidPayslipMutation();

  if (!canRead)
    return (
      <PermissionDenied
        title="You don't have permission to view payroll runs."
        missingPermission="hr.payroll.read"
      />
    );
  if (loadingRun) return <Loading />;
  if (isError || !run) return <ErrorDisplay message="Could not load payroll run." />;

  // Enforce SoD: block the Approve button when this approver is also the one
  // who submitted processing. The backend enforces this too; the UI disables
  // the button early so the approver can call in a colleague rather than
  // receiving a cryptic 403.
  const sodWarning =
    canApprove && run.status === "REVIEW" && !!run.processedById && run.processedById === userId;
  const payslips = payslipsData?.data ?? [];
  // Payslips are generated server-side when the run enters PROCESSING; none
  // exist yet in DRAFT / FAILED, so the empty-state message guides the operator
  // to trigger processing rather than implying something went wrong.
  const emptyMsg =
    run.status === "DRAFT" || run.status === "FAILED"
      ? "Process to generate payslips."
      : "No payslips.";

  async function handleAction(action: "process" | "approve" | "pay") {
    try {
      if (action === "process") await process(id).unwrap();
      else if (action === "approve") await approve(id).unwrap();
      else await pay(id).unwrap();
      const labels = { process: "REVIEW", approve: "APPROVED", pay: "PAID" };
      showSuccess(`Run moved to ${labels[action]}`);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleVoid() {
    if (!voidTarget || !voidReason.trim()) return;
    try {
      await voidPayslip({
        runId: id,
        pid: voidTarget.id,
        data: { reason: voidReason },
      }).unwrap();
      showSuccess("Payslip voided");
      setVoidTarget(null);
      setVoidReason("");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <Button
        asChild
        variant="ghost"
        size="sm"
        icon={<ArrowLeft className="h-4 w-4" />}
        className="mb-4"
      >
        <Link href={ROUTES.HR_PAYROLL_RUNS}>Back</Link>
      </Button>

      <PageHeader
        title={run.name}
        description={`${format(new Date(run.periodStart), "dd MMM")} – ${format(new Date(run.periodEnd), "dd MMM yyyy")} · ${run.payCycle}`}
        actions={
          canManageActions ? (
            <div className="flex flex-wrap gap-2">
              {(run.status === "DRAFT" || run.status === "FAILED") && canProcess && (
                <Button onClick={() => handleAction("process")} loading={processing}>
                  {run.status === "FAILED" ? "Re-process" : "Process"}
                </Button>
              )}
              {run.status === "REVIEW" && canApprove && (
                <Button
                  onClick={() => handleAction("approve")}
                  loading={approving}
                  disabled={sodWarning}
                >
                  Approve
                </Button>
              )}
              {run.status === "APPROVED" && canDisburse && (
                <Button onClick={() => handleAction("pay")} loading={paying}>
                  Mark paid
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {/* Lifecycle */}
      <Card className="mb-6">
        {run.status === "CANCELLED" ? (
          <div className="flex items-center gap-2">
            <Badge variant="default">Cancelled</Badge>
            {run.cancelReason && (
              <span className="text-sm text-slate-500 dark:text-slate-400">{run.cancelReason}</span>
            )}
          </div>
        ) : (
          <>
            <RunStepper status={run.status} />
            {sodWarning && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Lock className="h-3.5 w-3.5" />
                Needs a different approver.
              </p>
            )}
          </>
        )}
      </Card>

      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Payslips</h2>
        <span className="text-sm text-slate-400 dark:text-slate-500">{payslips.length}</span>
      </div>

      {loadingPayslips ? (
        <Loading />
      ) : payslips.length === 0 ? (
        <Card className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {emptyMsg}
        </Card>
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Gross</th>
                  <th className="px-4 py-3 font-medium">Deductions</th>
                  <th className="px-4 py-3 font-medium">Net</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Flags</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      {p.employee ? (
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {p.employee.firstName} {p.employee.lastName}
                          </p>
                          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                            {p.employee.employeeCode}
                          </p>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {p.employeeId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {money(p.grossPay)} {p.currency}
                    </td>
                    <td className="px-4 py-3 text-danger-600 dark:text-danger-300">
                      -{money(p.totalDeductions)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {money(p.netPay)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        {p.status === "FINALIZED" && (
                          <Lock className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                        )}
                        <Badge
                          variant={
                            p.status === "FINALIZED"
                              ? "success"
                              : p.status === "VOIDED"
                                ? "danger"
                                : "outline"
                          }
                        >
                          {p.status}
                        </Badge>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {/* Flags (e.g. MISSING_ATTENDANCE, ADVANCE_RECOVERY, OVERTIME_CAPPED)
                          are set by the payroll engine to highlight anomalies for the approver. */}
                      <div className="flex flex-wrap gap-1">
                        {(p.flags ?? []).map((flag) => {
                          const info = PAYSLIP_FLAGS[flag];
                          return (
                            <Badge key={flag} variant={info?.variant ?? "default"}>
                              {info?.label ?? flag}
                            </Badge>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setDetailPayslipId(p.id)}>
                          View
                        </Button>
                        {canVoidPayslip && p.status === "FINALIZED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setVoidTarget(p);
                              setVoidReason("");
                            }}
                          >
                            Void
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

      {/* Payslip detail */}
      <Modal open={!!detailPayslipId} onClose={() => setDetailPayslipId(null)} title="Payslip">
        {loadingDetail ? (
          <Loading />
        ) : payslipDetail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Gross</p>
                <p className="mt-0.5 text-base font-medium text-slate-800 dark:text-slate-100">
                  {money(payslipDetail.grossPay)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Deductions</p>
                <p className="mt-0.5 text-base font-medium text-danger-600 dark:text-danger-300">
                  -{money(payslipDetail.totalDeductions)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">Net</p>
                <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">
                  {money(payslipDetail.netPay)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Worked</p>
                <p>{payslipDetail.daysWorked}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Absent</p>
                <p>{payslipDetail.daysAbsent}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">OT hrs</p>
                <p>{payslipDetail.overtimeHours}</p>
              </div>
            </div>

            {(payslipDetail.flags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {payslipDetail.flags.map((flag) => {
                  const info = PAYSLIP_FLAGS[flag];
                  return (
                    <Badge key={flag} variant={info?.variant ?? "default"}>
                      {info?.label ?? flag}
                    </Badge>
                  );
                })}
              </div>
            )}

            {payslipDetail.lines && payslipDetail.lines.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                  Lines
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      <th className="py-2 font-medium">Component</th>
                      <th className="py-2 font-medium">Type</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslipDetail.lines.map((line) => {
                      // Both DEDUCTION and STATUTORY_DEDUCTION reduce net pay;
                      // render them in red with a leading minus.
                      const isDeduction =
                        line.type === "DEDUCTION" || line.type === "STATUTORY_DEDUCTION";
                      return (
                        <tr
                          key={line.id}
                          className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                        >
                          <td className="py-2">
                            <p className="font-medium text-slate-800 dark:text-slate-100">
                              {line.componentName}
                            </p>
                            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                              {line.componentCode}
                            </p>
                          </td>
                          <td className="py-2">
                            <Badge variant={COMPONENT_TYPE_VARIANT[line.type]}>
                              {line.type.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td
                            className={`py-2 text-right font-medium ${isDeduction ? "text-danger-600 dark:text-danger-300" : "text-slate-800 dark:text-slate-100"}`}
                          >
                            {isDeduction ? "-" : ""}
                            {money(line.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
              {detailPayslipId && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await openPayslipPdf(detailPayslipId, "admin");
                    } catch (err) {
                      showApiError(err);
                    }
                  }}
                >
                  Download
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDetailPayslipId(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Void payslip */}
      <Modal open={!!voidTarget} onClose={() => setVoidTarget(null)} title="Void payslip">
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">This can&apos;t be undone.</p>
          <FormField label="Reason" required>
            <Input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              required
              maxLength={500}
              placeholder="Reason…"
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" onClick={() => setVoidTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleVoid}
              loading={voiding}
              disabled={!voidReason.trim()}
            >
              Void
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
