"use client";

import { useState } from "react";
import { Link, useParams } from "@/shell/nav";
import { ArrowLeft, Plus, Edit, Archive, Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import {
  useGetSalaryStructureQuery,
  useCreateSalaryComponentMutation,
  useUpdateSalaryComponentMutation,
  useDeactivateSalaryComponentMutation,
  useApplyCountryPresetMutation,
} from "@/features/hr/api/payroll.api";
import type {
  SalaryComponent,
  CreateSalaryComponentInput,
  SalaryComponentType,
  ComponentCalcMethod,
} from "@/features/hr/types/payroll.types";
import { COMPONENT_TYPE_VARIANT } from "@/features/hr/types/payroll.types";

// ── Salary component config ───────────────────────────────────────────────────
// Presets are a convenience shortcut only — the backend applies a saved
// recipe of components for the chosen jurisdiction and returns a disclaimer
// reminding operators to verify current statutory rates.
const COUNTRY_CODES = ["US", "UK", "IN", "BD", "UAE"];
const COMPONENT_TYPES: SalaryComponentType[] = [
  "EARNING",
  "DEDUCTION",
  "STATUTORY_DEDUCTION",
  "EMPLOYER_CONTRIBUTION",
  "REIMBURSEMENT",
  "ADJUSTMENT",
];
const CALC_METHODS: ComponentCalcMethod[] = [
  "FIXED",
  "PERCENT_OF_BASIC",
  "PERCENT_OF_GROSS",
  "FORMULA",
  "ATTENDANCE_DERIVED",
];

const EMPTY_COMP: CreateSalaryComponentInput = {
  name: "",
  code: "",
  type: "EARNING",
  calcMethod: "FIXED",
  fixedAmount: null,
  percentValue: null,
  formulaKey: null,
  isTaxable: true,
  displayOrder: 0,
};

// Returns a human-readable summary of what a component computes to, used
// in the table's "Value" column. ATTENDANCE_DERIVED components have no static
// value — the payroll engine derives them from worked-day/hour records.
function componentValue(c: SalaryComponent): string {
  if (c.calcMethod === "FIXED") return c.fixedAmount ?? "";
  if (c.calcMethod === "PERCENT_OF_BASIC" || c.calcMethod === "PERCENT_OF_GROSS")
    return c.percentValue ? `${c.percentValue}%` : "";
  if (c.calcMethod === "FORMULA") return c.formulaKey ?? "";
  if (c.calcMethod === "ATTENDANCE_DERIVED") return "auto";
  return "";
}

// Salary structure detail — manage the ordered list of earning/deduction
// components that make up this payroll template.
//
// Each component declares how it is calculated (FIXED / PERCENT_OF_BASIC /
// PERCENT_OF_GROSS / FORMULA / ATTENDANCE_DERIVED). The payroll engine evaluates
// them in `displayOrder` sequence, so dependent components (e.g. HRA as
// a percent of Basic) must have a higher order number than their inputs.
//
// Country presets (Apply preset) seed the structure with jurisdiction-specific
// defaults (e.g. provident fund, ESI for IN). The disclaimer returned by the
// API should always be shown so the operator knows to verify actual rates.
export default function StructureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.payroll.salary-structure.read", "hr.payroll.salary-structure.manage");
  const canManage = can("hr.payroll.salary-structure.manage");

  const [compModalOpen, setCompModalOpen] = useState(false);
  const [editingComp, setEditingComp] = useState<SalaryComponent | null>(null);
  const [compForm, setCompForm] = useState<CreateSalaryComponentInput>(EMPTY_COMP);
  const [pendingDeactivate, setPendingDeactivate] = useState<SalaryComponent | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetCountry, setPresetCountry] = useState("US");
  const [presetDisclaimer, setPresetDisclaimer] = useState("");
  const [presetDoneOpen, setPresetDoneOpen] = useState(false);

  const {
    data: structure,
    isLoading: loadingStructure,
    isError,
  } = useGetSalaryStructureQuery(id, { skip: !canRead });
  const [createComp, { isLoading: creatingComp }] = useCreateSalaryComponentMutation();
  const [updateComp, { isLoading: updatingComp }] = useUpdateSalaryComponentMutation();
  const [deactivateComp, { isLoading: deactivatingComp }] = useDeactivateSalaryComponentMutation();
  const [applyPreset, { isLoading: applyingPreset }] = useApplyCountryPresetMutation();

  if (!canRead)
    return (
      <PermissionDenied
        title="You don't have permission to view salary structures."
        missingPermission="hr.payroll.salary-structure.read"
      />
    );
  if (loadingStructure) return <Loading />;
  if (isError || !structure) return <ErrorDisplay message="Could not load salary structure." />;

  function openNewComp() {
    setEditingComp(null);
    setCompForm(EMPTY_COMP);
    setCompModalOpen(true);
  }
  function openEditComp(c: SalaryComponent) {
    setEditingComp(c);
    setCompForm({
      name: c.name,
      code: c.code,
      type: c.type,
      calcMethod: c.calcMethod,
      fixedAmount: c.fixedAmount,
      percentValue: c.percentValue,
      formulaKey: c.formulaKey,
      isTaxable: c.isTaxable,
      displayOrder: c.displayOrder,
    });
    setCompModalOpen(true);
  }

  async function handleCompSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingComp) {
        await updateComp({
          structureId: id,
          cid: editingComp.id,
          data: compForm,
        }).unwrap();
        showSuccess("Component updated");
      } else {
        await createComp({ structureId: id, data: compForm }).unwrap();
        showSuccess("Component added");
      }
      setCompModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleDeactivateComp() {
    if (!pendingDeactivate) return;
    try {
      await deactivateComp({
        structureId: id,
        cid: pendingDeactivate.id,
      }).unwrap();
      showSuccess("Component deactivated");
      setPendingDeactivate(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleApplyPreset() {
    try {
      const result = await applyPreset({
        id,
        countryCode: presetCountry,
      }).unwrap();
      setPresetDisclaimer(result.disclaimer);
      setPresetModalOpen(false);
      setPresetDoneOpen(true);
    } catch (err) {
      showApiError(err);
    }
  }

  const comps = structure.components ?? [];

  return (
    <>
      <Button
        asChild
        variant="ghost"
        size="sm"
        icon={<ArrowLeft className="h-4 w-4" />}
        className="mb-4"
      >
        <Link href={ROUTES.HR_PAYROLL_STRUCTURES}>Back</Link>
      </Button>

      <PageHeader
        title={structure.name}
        description={`${structure.code}${structure.countryCode ? ` · ${structure.countryCode}` : ""}`}
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPresetModalOpen(true)}
                icon={<Globe className="h-4 w-4" />}
              >
                Preset
              </Button>
              <Button onClick={openNewComp} icon={<Plus className="h-4 w-4" />}>
                Add component
              </Button>
            </div>
          ) : undefined
        }
      />

      {comps.length === 0 ? (
        <Card className="py-12 text-center text-slate-500 dark:text-slate-400">
          <p className="mb-3 text-sm">No components yet.</p>
          {canManage && (
            <Button onClick={openNewComp} icon={<Plus className="h-4 w-4" />}>
              Add component
            </Button>
          )}
        </Card>
      ) : (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Calc</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Taxable</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 text-slate-400 dark:text-slate-500">
                      {c.displayOrder}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                        {c.code}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={COMPONENT_TYPE_VARIANT[c.type]}>
                        {c.type.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {c.calcMethod.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-200">
                      {componentValue(c)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {c.isTaxable ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.isActive ? "success" : "outline"}>
                        {c.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditComp(c)}
                            icon={<Edit className="h-4 w-4" />}
                          />
                          {c.isActive && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDeactivate(c)}
                              icon={<Archive className="h-4 w-4" />}
                            />
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

      <Modal
        open={compModalOpen}
        onClose={() => setCompModalOpen(false)}
        title={editingComp ? "Edit component" : "Add component"}
      >
        <form onSubmit={handleCompSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required>
              <Input
                value={compForm.name}
                onChange={(e) => setCompForm({ ...compForm, name: e.target.value })}
                required
                maxLength={100}
              />
            </FormField>
            <FormField label="Code" required>
              <Input
                value={compForm.code}
                onChange={(e) =>
                  setCompForm({
                    ...compForm,
                    code: e.target.value.toUpperCase(),
                  })
                }
                required
                maxLength={50}
                disabled={!!editingComp}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type" required>
              <Select
                value={compForm.type}
                onValueChange={(v) => setCompForm({ ...compForm, type: v as SalaryComponentType })}
                options={COMPONENT_TYPES.map((t) => ({
                  value: t,
                  label: t.replace(/_/g, " "),
                }))}
              />
            </FormField>
            <FormField label="Calc method" required>
              <Select
                value={compForm.calcMethod}
                onValueChange={(v) =>
                  setCompForm({
                    ...compForm,
                    calcMethod: v as ComponentCalcMethod,
                  })
                }
                options={CALC_METHODS.map((m) => ({
                  value: m,
                  label: m.replace(/_/g, " "),
                }))}
              />
            </FormField>
          </div>
          {compForm.calcMethod === "FIXED" && (
            <FormField label="Fixed amount">
              <Input
                type="number"
                step="0.0001"
                min="0"
                value={compForm.fixedAmount ?? ""}
                onChange={(e) =>
                  setCompForm({
                    ...compForm,
                    fixedAmount: e.target.value || null,
                  })
                }
                placeholder="0.00"
              />
            </FormField>
          )}
          {/* Percent fields only appear when calc method needs them — prevents
              saving irrelevant values that would confuse the payroll engine. */}
          {(compForm.calcMethod === "PERCENT_OF_BASIC" ||
            compForm.calcMethod === "PERCENT_OF_GROSS") && (
            <FormField label="Percent (%)">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={compForm.percentValue ?? ""}
                onChange={(e) =>
                  setCompForm({
                    ...compForm,
                    percentValue: e.target.value || null,
                  })
                }
                placeholder="0.00"
              />
            </FormField>
          )}
          {compForm.calcMethod === "FORMULA" && (
            <FormField label="Formula key">
              <Input
                value={compForm.formulaKey ?? ""}
                onChange={(e) =>
                  setCompForm({
                    ...compForm,
                    formulaKey: e.target.value || null,
                  })
                }
                placeholder="US_FIT"
                maxLength={64}
              />
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Display order">
              <Input
                type="number"
                min="0"
                value={compForm.displayOrder}
                onChange={(e) =>
                  setCompForm({
                    ...compForm,
                    displayOrder: parseInt(e.target.value) || 0,
                  })
                }
              />
            </FormField>
            <div className="flex items-end pb-2">
              <Checkbox
                label="Taxable"
                checked={compForm.isTaxable}
                onChange={(e) => setCompForm({ ...compForm, isTaxable: e.target.checked })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" type="button" onClick={() => setCompModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creatingComp || updatingComp}>
              {editingComp ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={presetModalOpen} onClose={() => setPresetModalOpen(false)} title="Apply preset">
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Replaces existing components.
          </p>
          <FormField label="Country">
            <Select
              value={presetCountry}
              onValueChange={(v) => setPresetCountry(v as string)}
              searchable
              options={COUNTRY_CODES.map((c) => ({ value: c, label: c }))}
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" type="button" onClick={() => setPresetModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyPreset} loading={applyingPreset}>
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={presetDoneOpen} onClose={() => setPresetDoneOpen(false)} title="Preset applied">
        <div className="space-y-4">
          {presetDisclaimer && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{presetDisclaimer}</p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review rates for your jurisdiction.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setPresetDoneOpen(false)}>Got it</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDeactivate}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={handleDeactivateComp}
        title="Deactivate component?"
        description={
          pendingDeactivate ? `"${pendingDeactivate.name}" — excluded from future payroll.` : ""
        }
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivatingComp}
      />
    </>
  );
}
