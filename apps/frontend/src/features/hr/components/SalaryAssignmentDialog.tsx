"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form/form-field";

import { useListSalaryStructuresQuery } from "@/features/hr/api/payroll.api";
import { useUpdateEmployeeSalaryMutation } from "@/features/hr/api/employees.api";
import type { SalaryUpdateInput } from "@/features/hr/types/hr.types";
import { showApiError, showSuccess } from "@/lib/api/error-handler";

interface Props {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
  onAssigned: () => void;
}

interface FormState {
  salaryStructureId: string;
  basicPay: string;
  ctc: string;
  currency: string;
  effectiveFrom: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SalaryAssignmentDialog({
  employeeId,
  employeeName,
  open,
  onClose,
  onAssigned,
}: Props) {
  const { data: structuresPage } = useListSalaryStructuresQuery({ limit: 100 } as never, {
    skip: !open,
  });
  const structures = structuresPage?.data ?? [];

  const [form, setForm] = useState<FormState>({
    salaryStructureId: "",
    basicPay: "",
    ctc: "",
    currency: "USD",
    effectiveFrom: todayIso(),
  });

  const [updateSalary, { isLoading }] = useUpdateEmployeeSalaryMutation();

  async function handleSave() {
    if (!form.salaryStructureId || !form.basicPay || !form.effectiveFrom) {
      return;
    }
    const payload: SalaryUpdateInput = {
      salaryStructureId: form.salaryStructureId,
      basicPay: form.basicPay,
      currency: form.currency,
      effectiveFrom: form.effectiveFrom,
      ...(form.ctc.trim() ? { ctc: form.ctc } : {}),
    };
    try {
      await updateSalary({ id: employeeId, data: payload }).unwrap();
      showSuccess("Salary assignment created");
      onAssigned();
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign salary — ${employeeName}`}
      description="Creates a new effective-dated EmployeeSalary row. The previous active row (if any) is automatically superseded. Past payslips reference the row that was active at payroll time."
      size="md"
      primaryAction={{
        label: "Assign",
        onClick: handleSave,
        loading: isLoading,
        disabled: !form.salaryStructureId || !form.basicPay || !form.effectiveFrom,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-4">
        <FormField label="Salary structure" required>
          <Select
            value={form.salaryStructureId}
            onValueChange={(v) => setForm((s) => ({ ...s, salaryStructureId: v as string }))}
            placeholder="Select a structure…"
            options={structures.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.code})`,
            }))}
          />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Basic pay" required hint="Up to 4 decimals.">
            <Input
              type="text"
              inputMode="decimal"
              value={form.basicPay}
              onChange={(e) => setForm((s) => ({ ...s, basicPay: e.target.value }))}
              placeholder="25000.00"
            />
          </FormField>
          <FormField label="CTC" hint="Optional — total cost to company.">
            <Input
              type="text"
              inputMode="decimal"
              value={form.ctc}
              onChange={(e) => setForm((s) => ({ ...s, ctc: e.target.value }))}
              placeholder="(optional)"
            />
          </FormField>
          <FormField label="Currency" required>
            <Input
              value={form.currency}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  currency: e.target.value.toUpperCase().slice(0, 3),
                }))
              }
              maxLength={3}
              placeholder="USD"
            />
          </FormField>
          <FormField label="Effective from" required>
            <Input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => setForm((s) => ({ ...s, effectiveFrom: e.target.value }))}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
}
