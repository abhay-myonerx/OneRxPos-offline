// Employee salary assignments — links an employee to a salary structure with a
// specific basic-pay amount and effective date.  Assigning a new salary does NOT
// delete the previous one: the old record's `effectiveTo` is set to the day before
// the new `effectiveFrom`, giving a complete salary history (shown as "Superseded").
//
// CTC (Cost to Company) is optional — it covers employer-side contributions that
// sit above the take-home figure (PF, gratuity, etc.) and is for HR reporting only.
"use client";

import { useState } from "react";
import { Plus, DollarSign } from "lucide-react";
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
import { EmployeeSelect } from "@/features/hr/components/EmployeeSelect";
import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useListEmployeeSalariesQuery,
  useAssignEmployeeSalaryMutation,
  useListSalaryStructuresQuery,
} from "@/features/hr/api/payroll.api";
import type { AssignEmployeeSalaryInput } from "@/features/hr/types/payroll.types";
import { format } from "date-fns";

const EMPTY: AssignEmployeeSalaryInput = {
  employeeId: "",
  salaryStructureId: "",
  basicPay: "",
  ctc: null,
  currency: "USD",
  effectiveFrom: "",
};

export default function EmployeeSalariesPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.payroll.salary-structure.read", "hr.payroll.salary-structure.manage");
  const canManage = can("hr.payroll.salary-structure.manage");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AssignEmployeeSalaryInput>(EMPTY);
  const [empIdFilter, setEmpIdFilter] = useState("");

  const { data, isLoading, isError, refetch } = useListEmployeeSalariesQuery(
    { employeeId: empIdFilter.trim() || undefined },
    { skip: !canRead },
  );
  const { data: structuresData } = useListSalaryStructuresQuery(
    { isActive: true },
    { skip: !canManage },
  );
  const [assign, { isLoading: assigning }] = useAssignEmployeeSalaryMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view salary assignments."
        missingPermission="hr.payroll.salary-structure.read"
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await assign(form).unwrap();
      showSuccess("Salary assigned");
      setModalOpen(false);
      setForm(EMPTY);
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];
  const structures = structuresData?.data ?? [];

  return (
    <>
      <PageHeader
        title="Employee salaries"
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setForm(EMPTY);
                setModalOpen(true);
              }}
              icon={<Plus className="h-4 w-4" />}
            >
              Assign salary
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6" padding={false}>
        <div className="p-4">
          <Input
            placeholder="Filter by employee ID…"
            value={empIdFilter}
            onChange={(e) => setEmpIdFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load salary assignments." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No assignments yet"
          message="Assign a structure to start payroll."
          icon={<DollarSign className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={() => setModalOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Assign salary
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
                  <th className="px-4 py-3 font-medium">Structure</th>
                  <th className="px-4 py-3 font-medium">Basic</th>
                  <th className="px-4 py-3 font-medium">CTC</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3">
                      {s.employee ? (
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {s.employee.firstName} {s.employee.lastName}
                          </p>
                          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                            {s.employee.employeeCode}
                          </p>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {s.employeeId.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {s.salaryStructure?.name ?? s.salaryStructureId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                      {parseFloat(s.basicPay).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {s.ctc ? parseFloat(s.ctc).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.currency}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {format(new Date(s.effectiveFrom), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {s.effectiveTo ? format(new Date(s.effectiveTo), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.effectiveTo ? "outline" : "success"}>
                        {s.effectiveTo ? "Superseded" : "Active"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Assign salary">
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Supersedes the current salary.
          </p>
          <EmployeeSelect
            value={form.employeeId}
            onChange={(employeeId) => setForm({ ...form, employeeId })}
            required
          />
          <FormField label="Structure" required>
            <Select
              value={form.salaryStructureId}
              onValueChange={(v) => setForm({ ...form, salaryStructureId: v as string })}
              placeholder="Select structure…"
              searchable
              options={structures.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.code})`,
              }))}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Basic pay" required>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.basicPay}
                onChange={(e) => setForm({ ...form, basicPay: e.target.value })}
                required
                placeholder="0.00"
              />
            </FormField>
            <FormField label="CTC">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.ctc ?? ""}
                onChange={(e) => setForm({ ...form, ctc: e.target.value || null })}
                placeholder="0.00"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Currency" required>
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                placeholder="USD"
                required
              />
            </FormField>
            <FormField label="Effective from" required>
              <Input
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                required
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={assigning}>
              Assign
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
