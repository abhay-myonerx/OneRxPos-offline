"use client";

import { useState } from "react";
import { ShieldAlert, Eye, EyeOff, Edit2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { Badge } from "@/components/ui/badge";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { useUpdateEmployeeSensitiveMutation } from "@/features/hr/api/employees.api";
import type { BankDetails, Employee } from "@/features/hr/types/hr.types";

interface Props {
  employee: Employee;
}

interface FormState {
  nationalId: string;
  passportNumber: string;
  taxId: string;
  bankDetails: BankDetails;
}

function emptyBank(): BankDetails {
  return {
    accountName: "",
    accountNumber: "",
    bankName: "",
    branch: "",
    ifsc: "",
    routing: "",
    swift: "",
  };
}

function maskValue(present: boolean): string {
  return present ? "●●●●●●●●●" : "—";
}

export function SensitivePiiPanel({ employee }: Props) {
  const { can } = usePermissions();
  const canRead = can("hr.employees.read.sensitive");
  const canUpdate = can("hr.employees.update.sensitive");

  const summary = employee.sensitiveSummary ?? {
    hasNationalId: false,
    hasPassportNumber: false,
    hasTaxId: false,
    hasBankDetails: false,
  };
  const reveal = employee.sensitive;

  const [editing, setEditing] = useState(false);
  const [showPlaintext, setShowPlaintext] = useState(false);
  const [form, setForm] = useState<FormState>({
    nationalId: reveal?.nationalId ?? "",
    passportNumber: reveal?.passportNumber ?? "",
    taxId: reveal?.taxId ?? "",
    bankDetails: reveal?.bankDetails ?? emptyBank(),
  });

  const [updateSensitive, { isLoading: saving }] = useUpdateEmployeeSensitiveMutation();

  function startEdit() {
    setForm({
      nationalId: reveal?.nationalId ?? "",
      passportNumber: reveal?.passportNumber ?? "",
      taxId: reveal?.taxId ?? "",
      bankDetails: reveal?.bankDetails ?? emptyBank(),
    });
    setEditing(true);
    setShowPlaintext(true);
  }

  async function handleSave() {
    // Build a minimal patch: only fields that actually changed are sent.
    // Empty string → null (clear the stored value); unchanged → omit entirely.
    // This lets the backend distinguish "clear this field" from "don't touch it".
    const patch: Record<string, unknown> = {};
    const currentNid = reveal?.nationalId ?? "";
    if (form.nationalId !== currentNid) {
      patch.nationalId = form.nationalId === "" ? null : form.nationalId;
    }
    const currentPpt = reveal?.passportNumber ?? "";
    if (form.passportNumber !== currentPpt) {
      patch.passportNumber = form.passportNumber === "" ? null : form.passportNumber;
    }
    const currentTax = reveal?.taxId ?? "";
    if (form.taxId !== currentTax) {
      patch.taxId = form.taxId === "" ? null : form.taxId;
    }
    const bd = form.bankDetails;
    // Bank details are treated atomically: either the full record is saved or
    // it is cleared. The three "core" fields (name, number, bank) must all be
    // present for any save; clearing them all removes the record entirely.
    const bdHasAny =
      bd.accountName.trim() !== "" || bd.accountNumber.trim() !== "" || bd.bankName.trim() !== "";
    const currentBd = reveal?.bankDetails ?? null;
    const bdChanged = JSON.stringify(bd) !== JSON.stringify(currentBd ?? {});
    if (bdChanged) {
      patch.bankDetails = bdHasAny
        ? {
            accountName: bd.accountName,
            accountNumber: bd.accountNumber,
            bankName: bd.bankName,
            ...(bd.branch ? { branch: bd.branch } : {}),
            ...(bd.ifsc ? { ifsc: bd.ifsc } : {}),
            ...(bd.routing ? { routing: bd.routing } : {}),
            ...(bd.swift ? { swift: bd.swift } : {}),
          }
        : null;
    }

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    try {
      await updateSensitive({ id: employee.id, data: patch }).unwrap();
      showSuccess("Sensitive details updated");
      setEditing(false);
    } catch (err) {
      showApiError(err);
    }
  }

  // ── Read-only render (no edit permission OR not editing) ─────────
  if (!editing) {
    return (
      <Card>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Sensitive details
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                National ID, passport, tax ID, bank details. Encrypted at rest.{" "}
                {canRead
                  ? "Click the eye to reveal."
                  : "Reveal restricted to roles with hr.employees.read.sensitive."}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {canRead && reveal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPlaintext((v) => !v)}
                icon={showPlaintext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              >
                {showPlaintext ? "Hide" : "Reveal"}
              </Button>
            )}
            {canUpdate && (
              <Button
                variant="outline"
                size="sm"
                onClick={startEdit}
                icon={<Edit2 className="h-4 w-4" />}
              >
                Edit
              </Button>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <SensitiveRow
            label="National ID"
            present={summary.hasNationalId}
            value={showPlaintext ? (reveal?.nationalId ?? null) : null}
          />
          <SensitiveRow
            label="Passport"
            present={summary.hasPassportNumber}
            value={showPlaintext ? (reveal?.passportNumber ?? null) : null}
          />
          <SensitiveRow
            label="Tax ID"
            present={summary.hasTaxId}
            value={showPlaintext ? (reveal?.taxId ?? null) : null}
          />
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Bank details
            </dt>
            {summary.hasBankDetails ? (
              showPlaintext && reveal?.bankDetails ? (
                <dd className="text-sm text-slate-800 dark:text-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Account name:</span>{" "}
                    {reveal.bankDetails.accountName}
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Account #:</span>{" "}
                    <span className="font-mono">{reveal.bankDetails.accountNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Bank:</span>{" "}
                    {reveal.bankDetails.bankName}
                  </div>
                  {reveal.bankDetails.branch && (
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Branch:</span>{" "}
                      {reveal.bankDetails.branch}
                    </div>
                  )}
                  {reveal.bankDetails.ifsc && (
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">IFSC:</span>{" "}
                      {reveal.bankDetails.ifsc}
                    </div>
                  )}
                  {reveal.bankDetails.swift && (
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">SWIFT:</span>{" "}
                      {reveal.bankDetails.swift}
                    </div>
                  )}
                </dd>
              ) : (
                <Badge>On file</Badge>
              )
            ) : (
              <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
            )}
          </div>
        </dl>
      </Card>
    );
  }

  // ── Edit form ────────────────────────────────────────────────────
  return (
    <Card>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" />
        Edit sensitive details
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="National ID" hint="Leave blank to clear.">
          <Input
            value={form.nationalId}
            onChange={(e) => setForm((s) => ({ ...s, nationalId: e.target.value }))}
            placeholder="—"
          />
        </FormField>
        <FormField label="Passport number" hint="Leave blank to clear.">
          <Input
            value={form.passportNumber}
            onChange={(e) => setForm((s) => ({ ...s, passportNumber: e.target.value }))}
          />
        </FormField>
        <FormField label="Tax ID / TIN / SSN" hint="Leave blank to clear.">
          <Input
            value={form.taxId}
            onChange={(e) => setForm((s) => ({ ...s, taxId: e.target.value }))}
          />
        </FormField>
      </div>

      <h4 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-6 mb-2">
        Bank details
      </h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Filling any field requires Account name + Account # + Bank name. Clearing all three removes
        the record entirely.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Account holder name">
          <Input
            value={form.bankDetails.accountName}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                bankDetails: { ...s.bankDetails, accountName: e.target.value },
              }))
            }
          />
        </FormField>
        <FormField label="Account number">
          <Input
            value={form.bankDetails.accountNumber}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                bankDetails: {
                  ...s.bankDetails,
                  accountNumber: e.target.value,
                },
              }))
            }
          />
        </FormField>
        <FormField label="Bank name">
          <Input
            value={form.bankDetails.bankName}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                bankDetails: { ...s.bankDetails, bankName: e.target.value },
              }))
            }
          />
        </FormField>
        <FormField label="Branch (optional)">
          <Input
            value={form.bankDetails.branch ?? ""}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                bankDetails: { ...s.bankDetails, branch: e.target.value },
              }))
            }
          />
        </FormField>
        <FormField label="IFSC (optional)">
          <Input
            value={form.bankDetails.ifsc ?? ""}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                bankDetails: { ...s.bankDetails, ifsc: e.target.value },
              }))
            }
          />
        </FormField>
        <FormField label="SWIFT (optional)">
          <Input
            value={form.bankDetails.swift ?? ""}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                bankDetails: { ...s.bankDetails, swift: e.target.value },
              }))
            }
          />
        </FormField>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <Button variant="outline" type="button" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} loading={saving}>
          Save sensitive details
        </Button>
      </div>
    </Card>
  );
}

function SensitiveRow({
  label,
  present,
  value,
}: {
  label: string;
  present: boolean;
  value: string | null;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="text-sm text-slate-800 dark:text-slate-100 mt-0.5 font-mono">
        {value ?? (present ? maskValue(true) : maskValue(false))}
      </dd>
    </div>
  );
}
