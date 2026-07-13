"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form/form-field";

import { useTerminateEmployeeMutation } from "@/features/hr/api/employees.api";
import type {
  SeparationReason,
  TerminateEmployeeInput,
  TerminationCascadeSummary,
} from "@/features/hr/types/hr.types";
import { showApiError, showSuccess } from "@/lib/api/error-handler";

const REASONS: ReadonlyArray<{ value: SeparationReason; label: string }> = [
  { value: "RESIGNATION", label: "Resignation" },
  { value: "RETIREMENT", label: "Retirement" },
  { value: "TERMINATION", label: "Termination (for cause)" },
  { value: "CONTRACT_END", label: "Contract end" },
  { value: "REDUNDANCY", label: "Redundancy" },
  { value: "DECEASED", label: "Deceased" },
  { value: "ABSCONDED", label: "Absconded" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  employeeId: string;
  employeeName: string;
  hasLinkedUser: boolean;
  open: boolean;
  onClose: () => void;
  onTerminated: (summary: TerminationCascadeSummary) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TerminateEmployeeDialog({
  employeeId,
  employeeName,
  hasLinkedUser,
  open,
  onClose,
  onTerminated,
}: Props) {
  const [reason, setReason] = useState<SeparationReason>("RESIGNATION");
  const [endDate, setEndDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [deactivateUser, setDeactivateUser] = useState(true);
  const [cancelApprovedFutureLeave, setCancelApprovedFutureLeave] = useState(false);

  const [terminate, { isLoading }] = useTerminateEmployeeMutation();

  async function handleConfirm() {
    const payload: TerminateEmployeeInput = {
      employmentEndDate: endDate,
      separationReason: reason,
      ...(notes.trim() ? { separationNotes: notes } : {}),
      deactivateUser,
      cancelApprovedFutureLeave,
    };
    try {
      const result = await terminate({
        id: employeeId,
        data: payload,
      }).unwrap();
      showSuccess(`${employeeName} terminated`);
      onTerminated(result.cascadeSummary);
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Terminate ${employeeName}`}
      size="md"
      variant="confirm"
      primaryAction={{
        label: "Confirm termination",
        onClick: handleConfirm,
        loading: isLoading,
        variant: "danger",
        disabled: !endDate,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-md border border-danger-200 dark:border-danger-500/30 bg-danger-50 dark:bg-danger-500/15 p-3 text-sm text-danger-800 dark:text-danger-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>This cannot be undone in one click.</strong> Reactivating a terminated employee
            requires HR to manually reverse the cascade.
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Employment end date" required>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
          <FormField label="Separation reason" required>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as SeparationReason)}
              options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </FormField>
        </div>
        <FormField label="Notes (HR-only — redacted in audit log)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional context…"
          />
        </FormField>
        <div className="space-y-2 pt-1">
          {hasLinkedUser && (
            <Checkbox
              label="Deactivate linked user + revoke all active sessions"
              checked={deactivateUser}
              onChange={(e) => setDeactivateUser(e.target.checked)}
            />
          )}
          <Checkbox
            label="Also cancel APPROVED future leave (default: leave it alone)"
            checked={cancelApprovedFutureLeave}
            onChange={(e) => setCancelApprovedFutureLeave(e.target.checked)}
          />
          <p className="ml-6 text-xs text-slate-500 dark:text-slate-400">
            PENDING leave is always cancelled. APPROVED leave is contractually owed unless this is
            checked. Future SCHEDULED shifts are always cancelled.
          </p>
        </div>
      </div>
    </Modal>
  );
}
