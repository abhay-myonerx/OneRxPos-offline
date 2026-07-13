"use client";

import { useNavigate } from "@/shell/nav";
import { useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form/form-field";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { usePermissions } from "@/hooks/usePermissions";
import { useApplyEssLeaveMutation, useListEssLeaveTypesQuery } from "@/features/ess/api/ess.api";
import { EssStateGate } from "@/features/ess/components/EssStateGate";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { ROUTES } from "@/constants/routes";

export default function EssLeaveApplyPage() {
  const navigate = useNavigate();
  const { canAny } = usePermissions();
  const canApply = canAny("ess.leave.request.create");

  const {
    data: typesData,
    isLoading,
    isError,
    error,
  } = useListEssLeaveTypesQuery(undefined, { skip: !canApply });
  const [apply, applyState] = useApplyEssLeaveMutation();

  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    isHalfDay: false,
    reason: "",
    documentUrl: "",
  });

  if (!canApply) {
    return (
      <PermissionDenied
        title="You don't have permission to apply for leave."
        missingPermission="ess.leave.request.create"
      />
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apply({
        leaveTypeId: form.leaveTypeId,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        isHalfDay: form.isHalfDay,
        reason: form.reason || null,
        documentUrl: form.documentUrl || null,
      }).unwrap();
      showSuccess("Leave request submitted");
      navigate(ROUTES.ESS_LEAVE);
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Apply for Leave
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Submit a leave request for approval.
        </p>
      </div>

      <EssStateGate
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={typesData}
        isEmpty={(d) => d.data.length === 0}
        emptyTitle="No leave types configured"
        emptyMessage="Please contact HR to set up leave types before applying."
      >
        {(types) => {
          const selectedType = types.data.find((t) => t.id === form.leaveTypeId);
          const requiresDocument = selectedType?.requiresDocument ?? false;
          return (
            <form onSubmit={handleSubmit}>
              <Card className="overflow-hidden max-w-2xl">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Leave details
                  </h2>
                </div>
                <div className="p-4 space-y-4">
                  <FormField label="Leave type" required>
                    <Select
                      value={form.leaveTypeId}
                      placeholder="Select a leave type…"
                      required
                      options={types.data.map((t) => ({
                        value: t.id,
                        label: `${t.name}${t.isPaid ? "" : " (unpaid)"}`,
                      }))}
                      onValueChange={(v) => setForm({ ...form, leaveTypeId: v as string })}
                    />
                  </FormField>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Start date" required>
                      <Input
                        type="date"
                        value={form.startDate}
                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                        required
                      />
                    </FormField>
                    <FormField label="End date" required>
                      <Input
                        type="date"
                        value={form.endDate}
                        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                        required
                      />
                    </FormField>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <Checkbox
                      checked={form.isHalfDay}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          isHalfDay: (e.target as HTMLInputElement).checked,
                          endDate: (e.target as HTMLInputElement).checked
                            ? form.startDate
                            : form.endDate,
                        })
                      }
                    />
                    Half day (start date only)
                  </label>

                  <FormField label="Reason">
                    <Textarea
                      rows={3}
                      maxLength={2000}
                      value={form.reason}
                      onChange={(e) => setForm({ ...form, reason: e.target.value })}
                      placeholder="Optional — provide context if helpful"
                    />
                  </FormField>

                  {requiresDocument && (
                    <FormField
                      label="Document URL"
                      required
                      hint="This leave type requires supporting evidence (e.g. medical certificate). Paste the upload URL."
                    >
                      <Input
                        type="url"
                        value={form.documentUrl}
                        onChange={(e) => setForm({ ...form, documentUrl: e.target.value })}
                        placeholder="https://…"
                        required
                      />
                    </FormField>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate(ROUTES.ESS_LEAVE)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" loading={applyState.isLoading}>
                      Submit request
                    </Button>
                  </div>
                </div>
              </Card>
            </form>
          );
        }}
      </EssStateGate>
    </div>
  );
}
