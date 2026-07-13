// Salary advance lifecycle:
//   PENDING → (approve) → APPROVED → (disburse) → DISBURSED → RECOVERING → SETTLED
//   PENDING → (reject)  → REJECTED
//   APPROVED → (cancel) → CANCELLED
//
// `installments` controls how many pay periods the advance is deducted across.
// `amountPerInstallment` is computed server-side (amount / installments) and
// shown read-only so HR can confirm the per-period deduction before disbursing.
"use client";

import { useState } from "react";
import { Plus, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { EmployeeSelect } from "@/features/hr/components/EmployeeSelect";
import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useListSalaryAdvancesQuery,
  useCreateSalaryAdvanceMutation,
  useApproveSalaryAdvanceMutation,
  useRejectSalaryAdvanceMutation,
  useDisburseSalaryAdvanceMutation,
  useCancelSalaryAdvanceMutation,
} from "@/features/hr/api/payroll.api";
import type {
  CreateSalaryAdvanceInput,
  SalaryAdvance,
  SalaryAdvanceStatus,
} from "@/features/hr/types/payroll.types";
import { ADVANCE_STATUS_VARIANT } from "@/features/hr/types/payroll.types";
import { format } from "date-fns";

const EMPTY: CreateSalaryAdvanceInput = {
  employeeId: "",
  amount: "",
  currency: "USD",
  reason: "",
  installments: 1,
};
const STATUSES: SalaryAdvanceStatus[] = [
  "PENDING",
  "APPROVED",
  "DISBURSED",
  "RECOVERING",
  "SETTLED",
  "REJECTED",
  "CANCELLED",
];

export default function SalaryAdvancesPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.payroll.advance.read", "hr.payroll.advance.create");
  const canCreate = can("hr.payroll.advance.create");
  const canApprove = can("hr.payroll.advance.approve");
  const canDisburse = can("hr.payroll.advance.disburse");
  const canAction = canCreate || canApprove || canDisburse;

  const [statusFilter, setStatusFilter] = useState<SalaryAdvanceStatus | "">("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateSalaryAdvanceInput>(EMPTY);
  const [pendingAction, setPendingAction] = useState<{
    advance: SalaryAdvance;
    action: "approve" | "reject" | "disburse" | "cancel";
  } | null>(null);

  const { data, isLoading, isError, refetch } = useListSalaryAdvancesQuery(
    { status: statusFilter || undefined },
    { skip: !canRead },
  );
  const [create, { isLoading: creating }] = useCreateSalaryAdvanceMutation();
  const [approve, { isLoading: approving }] = useApproveSalaryAdvanceMutation();
  const [reject, { isLoading: rejecting }] = useRejectSalaryAdvanceMutation();
  const [disburse, { isLoading: disbursing }] = useDisburseSalaryAdvanceMutation();
  const [cancelAdv, { isLoading: cancelling }] = useCancelSalaryAdvanceMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view salary advances."
        missingPermission="hr.payroll.advance.read"
      />
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create(form).unwrap();
      showSuccess("Advance requested");
      setModalOpen(false);
      setForm(EMPTY);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleAction() {
    if (!pendingAction) return;
    const { advance, action } = pendingAction;
    try {
      if (action === "approve") await approve(advance.id).unwrap();
      else if (action === "reject") await reject(advance.id).unwrap();
      else if (action === "disburse") await disburse(advance.id).unwrap();
      else await cancelAdv(advance.id).unwrap();
      showSuccess(`Advance ${action}d`);
      setPendingAction(null);
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];
  // Live preview of the per-installment deduction so the operator sees the
  // monthly impact before submitting.
  const amountPreview =
    form.amount && form.installments > 1
      ? (parseFloat(form.amount) / form.installments).toFixed(2)
      : null;
  const isActioning = approving || rejecting || disbursing || cancelling;

  return (
    <>
      <PageHeader
        title="Salary advances"
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setForm(EMPTY);
                setModalOpen(true);
              }}
              icon={<Plus className="h-4 w-4" />}
            >
              Request advance
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6" padding={false}>
        <div className="p-4 sm:max-w-xs">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as string as SalaryAdvanceStatus | "")}
            placeholder="All statuses"
            clearable
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load salary advances." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No advances"
          message={canCreate ? "Request an advance for an employee." : "No advances found."}
          icon={<DollarSign className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          action={
            canCreate ? (
              <Button onClick={() => setModalOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Request advance
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
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Per term</th>
                  <th className="px-4 py-3 font-medium">Terms</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Requested</th>
                  {canAction && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((adv) => (
                  <tr
                    key={adv.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      {adv.employee ? (
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {adv.employee.firstName} {adv.employee.lastName}
                          </p>
                          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                            {adv.employee.employeeCode}
                          </p>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {adv.employeeId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {parseFloat(adv.amount).toFixed(2)} {adv.currency}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {parseFloat(adv.amountPerInstallment).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {adv.installments}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ADVANCE_STATUS_VARIANT[adv.status]}>{adv.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {format(new Date(adv.createdAt), "dd MMM yyyy")}
                    </td>
                    {canAction && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {adv.status === "PENDING" && canApprove && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPendingAction({
                                    advance: adv,
                                    action: "approve",
                                  })
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setPendingAction({
                                    advance: adv,
                                    action: "reject",
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {adv.status === "APPROVED" && (
                            <>
                              {canDisburse && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setPendingAction({
                                      advance: adv,
                                      action: "disburse",
                                    })
                                  }
                                >
                                  Disburse
                                </Button>
                              )}
                              {canCreate && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setPendingAction({
                                      advance: adv,
                                      action: "cancel",
                                    })
                                  }
                                >
                                  Cancel
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Request advance">
        <form onSubmit={handleCreate} className="space-y-4">
          <EmployeeSelect
            value={form.employeeId}
            onChange={(employeeId) => setForm({ ...form, employeeId })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Amount" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Currency">
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3}
              />
            </FormField>
          </div>
          <FormField label="Installments">
            <Input
              type="number"
              min={1}
              max={60}
              value={form.installments}
              onChange={(e) =>
                setForm({
                  ...form,
                  installments: parseInt(e.target.value) || 1,
                })
              }
            />
          </FormField>
          {amountPreview && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Per term:{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {amountPreview} {form.currency}
              </strong>
            </p>
          )}
          <FormField label="Reason">
            <Input
              value={form.reason ?? ""}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              maxLength={1000}
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating}>
              Submit
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={handleAction}
        title={
          pendingAction
            ? `${pendingAction.action.charAt(0).toUpperCase() + pendingAction.action.slice(1)} advance?`
            : ""
        }
        description={
          pendingAction
            ? `${parseFloat(pendingAction.advance.amount).toFixed(2)} ${pendingAction.advance.currency}`
            : ""
        }
        confirmLabel={pendingAction?.action ?? "Confirm"}
        variant="warning"
        loading={isActioning}
      />
    </>
  );
}
