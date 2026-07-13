"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form/form-field";
import { Stepper, type Step } from "@/components/ui/stepper";
import { AvatarUpload } from "@/features/media/components/upload/AvatarUpload";

import { useListDepartmentsQuery } from "@/features/hr/api/departments.api";
import { useListDesignationsQuery } from "@/features/hr/api/designations.api";
import { EmployeeSelect } from "@/features/hr/components/EmployeeSelect";

import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, GENDERS } from "@/features/hr/types/hr.types";
import type {
  CreateEmployeeInput,
  CreateUserRole,
  EmploymentStatus,
  EmploymentType,
  Gender,
} from "@/features/hr/types/hr.types";

export interface EmployeeFormProps {
  value: CreateEmployeeInput;
  onChange: (next: CreateEmployeeInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  submitting?: boolean;
  showCreateUserSection?: boolean;
  availableUserRoles?: CreateUserRole[];
}

const DEFAULT_USER_ROLES: CreateUserRole[] = ["MANAGER", "HR_MANAGER", "CASHIER", "EMPLOYEE"];

function toDateInput(v?: string | null): string {
  return v ? v.slice(0, 10) : "";
}

// Multi-step employee form shared by the "New employee" and "Edit employee"
// flows. The Account step (step 4) is only rendered during employee creation
// to optionally provision a login account in the same request.
//
// Validation is per-step so the user gets feedback immediately rather than
// on final submit. If the final submit finds an earlier step invalid (e.g.
// the user jumped forward via the stepper), it navigates back to the first
// failing step automatically.
//
// `onChange` lifts the whole draft upward (parent owns state) so the
// create/edit pages can inject defaults, run their own submit mutations,
// and read the final value without any imperative refs.
export function EmployeeForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  submitting = false,
  showCreateUserSection = false,
  availableUserRoles = DEFAULT_USER_ROLES,
}: EmployeeFormProps) {
  const { data: deptData } = useListDepartmentsQuery({
    limit: 100,
    archived: "active",
  });
  const { data: desigData } = useListDesignationsQuery({
    limit: 100,
    archived: "active",
  });

  const departments = deptData?.data ?? [];
  const designations = desigData?.data ?? [];

  // ── Steps ──
  const steps: Step[] = useMemo(() => {
    const base: Step[] = [
      { label: "Profile", description: "Photo & basics" },
      { label: "Contact", description: "Address & kin" },
      { label: "Employment", description: "Role & dates" },
    ];
    if (showCreateUserSection) base.push({ label: "Account", description: "Login access" });
    return base;
  }, [showCreateUserSection]);

  const lastStep = steps.length - 1;
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  function patch(p: Partial<CreateEmployeeInput>) {
    onChange({ ...value, ...p });
  }

  // Per-step required-field gate. Keys map to FormField error slots.
  function stepErrors(idx: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (idx === 0) {
      if (!value.employeeCode?.trim()) e.employeeCode = "Required";
      if (!value.firstName?.trim()) e.firstName = "Required";
      if (!value.lastName?.trim()) e.lastName = "Required";
    }
    if (idx === 2) {
      if (!value.departmentId) e.departmentId = "Required";
      if (!value.designationId) e.designationId = "Required";
      if (!value.employmentStartDate) e.employmentStartDate = "Required";
    }
    // Account step: only required when the operator chose to create a user.
    if (idx === 3 && value.createUser && !value.createUser.email?.trim()) {
      e.userEmail = "Required";
    }
    return e;
  }

  const isStepValid = (idx: number) => Object.keys(stepErrors(idx)).length === 0;
  const errs = showErrors ? stepErrors(step) : {};

  function goTo(idx: number) {
    setShowErrors(false);
    setStep(idx);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < lastStep) {
      if (isStepValid(step)) goTo(step + 1);
      else setShowErrors(true);
      return;
    }
    // Final step → validate every step, jump to the first that fails.
    const firstInvalid = steps.findIndex((_, i) => !isStepValid(i));
    if (firstInvalid !== -1) {
      setStep(firstInvalid);
      setShowErrors(true);
      return;
    }
    onSubmit();
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      <Stepper steps={steps} current={step} onStepClick={goTo} className="pb-2" />

      {/* Step 1 — Profile */}
      {step === 0 && (
        <div className="space-y-6">
          <FormField label="Profile photo">
            <AvatarUpload
              allowUrl
              value={value.photo ?? null}
              onUpload={(url) => patch({ photo: url })}
              onRemove={() => patch({ photo: null })}
              urlPlaceholder="https://example.com/profile.jpg"
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Code" required error={errs.employeeCode}>
              <Input
                value={value.employeeCode}
                onChange={(e) => patch({ employeeCode: e.target.value })}
                placeholder="EMP001"
              />
            </FormField>
            <FormField label="First name" required error={errs.firstName}>
              <Input
                value={value.firstName}
                onChange={(e) => patch({ firstName: e.target.value })}
              />
            </FormField>
            <FormField label="Middle name">
              <Input
                value={value.middleName ?? ""}
                onChange={(e) => patch({ middleName: e.target.value || null })}
              />
            </FormField>
            <FormField label="Last name" required error={errs.lastName}>
              <Input value={value.lastName} onChange={(e) => patch({ lastName: e.target.value })} />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={value.email ?? ""}
                onChange={(e) => patch({ email: e.target.value || null })}
              />
            </FormField>
            <FormField label="Phone">
              <Input
                value={value.phone ?? ""}
                onChange={(e) => patch({ phone: e.target.value || null })}
              />
            </FormField>
            <FormField label="Alt. phone">
              <Input
                value={value.alternatePhone ?? ""}
                onChange={(e) => patch({ alternatePhone: e.target.value || null })}
              />
            </FormField>
            <FormField label="Birth date">
              <Input
                type="date"
                value={toDateInput(value.dateOfBirth)}
                onChange={(e) => patch({ dateOfBirth: e.target.value || null })}
              />
            </FormField>
            <FormField label="Gender">
              <Select
                value={value.gender ?? ""}
                onValueChange={(v) => patch({ gender: ((v as string) || null) as Gender | null })}
                placeholder="—"
                clearable
                options={GENDERS.map((g) => ({
                  value: g,
                  label: g.replace(/_/g, " "),
                }))}
              />
            </FormField>
            <FormField label="Marital status">
              <Input
                value={value.maritalStatus ?? ""}
                onChange={(e) => patch({ maritalStatus: e.target.value || null })}
                placeholder="Single / Married"
              />
            </FormField>
          </div>
        </div>
      )}

      {/* Step 2 — Contact */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              Address
            </h3>
            <FormField label="Street" className="mb-4">
              <Textarea
                value={value.address ?? ""}
                onChange={(e) => patch({ address: e.target.value || null })}
                rows={2}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="City">
                <Input
                  value={value.city ?? ""}
                  onChange={(e) => patch({ city: e.target.value || null })}
                />
              </FormField>
              <FormField label="State">
                <Input
                  value={value.state ?? ""}
                  onChange={(e) => patch({ state: e.target.value || null })}
                />
              </FormField>
              <FormField label="Postal code">
                <Input
                  value={value.postalCode ?? ""}
                  onChange={(e) => patch({ postalCode: e.target.value || null })}
                />
              </FormField>
              <FormField label="Country">
                <Input
                  value={value.country ?? ""}
                  onChange={(e) =>
                    patch({
                      country: (e.target.value || null)?.toUpperCase().slice(0, 2) ?? null,
                    })
                  }
                  // ISO 3166-1 alpha-2 — stored uppercase, two characters max.
                  placeholder="BD"
                  maxLength={2}
                />
              </FormField>
            </div>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
            <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              Emergency contact
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Name">
                <Input
                  value={value.emergencyContact?.name ?? ""}
                  onChange={(e) =>
                    patch({
                      emergencyContact: e.target.value
                        ? {
                            ...(value.emergencyContact ?? { name: "" }),
                            name: e.target.value,
                          }
                        : null,
                    })
                  }
                />
              </FormField>
              <FormField label="Relationship">
                <Input
                  value={value.emergencyContact?.relationship ?? ""}
                  onChange={(e) =>
                    patch({
                      emergencyContact: {
                        name: value.emergencyContact?.name ?? "",
                        ...(value.emergencyContact ?? {}),
                        relationship: e.target.value || null,
                      },
                    })
                  }
                />
              </FormField>
              <FormField label="Phone">
                <Input
                  value={value.emergencyContact?.phone ?? ""}
                  onChange={(e) =>
                    patch({
                      emergencyContact: {
                        name: value.emergencyContact?.name ?? "",
                        ...(value.emergencyContact ?? {}),
                        phone: e.target.value || null,
                      },
                    })
                  }
                />
              </FormField>
              <FormField label="Email">
                <Input
                  type="email"
                  value={value.emergencyContact?.email ?? ""}
                  onChange={(e) =>
                    patch({
                      emergencyContact: {
                        name: value.emergencyContact?.name ?? "",
                        ...(value.emergencyContact ?? {}),
                        email: e.target.value || null,
                      },
                    })
                  }
                />
              </FormField>
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Employment */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Department" required error={errs.departmentId}>
              <Select
                value={value.departmentId}
                onValueChange={(v) => patch({ departmentId: v as string })}
                placeholder="Select…"
                searchable
                options={departments.map((d) => ({
                  value: d.id,
                  label: `${d.name} (${d.code})`,
                }))}
              />
            </FormField>
            <FormField label="Designation" required error={errs.designationId}>
              <Select
                value={value.designationId}
                onValueChange={(v) => patch({ designationId: v as string })}
                placeholder="Select…"
                searchable
                options={designations.map((d) => ({
                  value: d.id,
                  label: `${d.title} (${d.code})`,
                }))}
              />
            </FormField>
            <FormField label="Reports to">
              <EmployeeSelect
                label=""
                value={value.reportsToId ?? ""}
                onChange={(id) => patch({ reportsToId: id || null })}
                placeholder="Select manager…"
              />
            </FormField>
            <FormField label="Status">
              <Select
                value={value.employmentStatus ?? "ACTIVE"}
                onValueChange={(v) => patch({ employmentStatus: v as EmploymentStatus })}
                options={EMPLOYMENT_STATUSES.map((s) => ({
                  value: s,
                  label: s.replace(/_/g, " "),
                }))}
              />
            </FormField>
            <FormField label="Type">
              <Select
                value={value.employmentType ?? "FULL_TIME"}
                onValueChange={(v) => patch({ employmentType: v as EmploymentType })}
                options={EMPLOYMENT_TYPES.map((t) => ({
                  value: t,
                  label: t.replace(/_/g, " "),
                }))}
              />
            </FormField>
            <FormField label="Start date" required error={errs.employmentStartDate}>
              <Input
                type="date"
                value={toDateInput(value.employmentStartDate)}
                onChange={(e) => patch({ employmentStartDate: e.target.value })}
              />
            </FormField>
            <FormField label="Confirmed on">
              <Input
                type="date"
                value={toDateInput(value.confirmationDate)}
                onChange={(e) => patch({ confirmationDate: e.target.value || null })}
              />
            </FormField>
            <FormField label="End date">
              <Input
                type="date"
                value={toDateInput(value.employmentEndDate)}
                onChange={(e) => patch({ employmentEndDate: e.target.value || null })}
              />
            </FormField>
            <FormField label="Notice (days)">
              <Input
                type="number"
                min={0}
                max={365}
                value={
                  value.noticePeriodDays === null || value.noticePeriodDays === undefined
                    ? ""
                    : value.noticePeriodDays
                }
                onChange={(e) =>
                  patch({
                    noticePeriodDays: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea
              value={value.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value || null })}
              rows={3}
            />
          </FormField>
        </div>
      )}

      {/* Step 4 — Account (create flow only)
          Skipped entirely during edit — account linking has its own dialog. */}
      {step === 3 && showCreateUserSection && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Optionally create a sign-in account now. Skip to add one later.
          </p>
          <Checkbox
            label="Create a login account"
            checked={Boolean(value.createUser)}
            onChange={(e) =>
              patch({
                createUser: e.target.checked
                  ? {
                      email: value.email ?? "",
                      role: availableUserRoles[0] ?? "EMPLOYEE",
                      password: "",
                    }
                  : undefined,
              })
            }
          />
          {value.createUser && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-4 md:grid-cols-2">
              <FormField label="Login email" required error={errs.userEmail}>
                <Input
                  type="email"
                  value={value.createUser.email}
                  onChange={(e) =>
                    patch({
                      createUser: {
                        ...value.createUser!,
                        email: e.target.value,
                      },
                    })
                  }
                  placeholder="employee@example.com"
                />
              </FormField>
              <FormField label="Role" required>
                <Select
                  value={value.createUser.role}
                  onValueChange={(v) =>
                    patch({
                      createUser: {
                        ...value.createUser!,
                        role: v as CreateUserRole,
                      },
                    })
                  }
                  options={availableUserRoles.map((r) => ({
                    value: r,
                    label: r.replace("_", " "),
                  }))}
                />
              </FormField>
              <FormField label="Temp. password" hint="Leave empty to auto-generate.">
                <Input
                  type="text"
                  autoComplete="off"
                  value={value.createUser.password ?? ""}
                  onChange={(e) =>
                    patch({
                      createUser: {
                        ...value.createUser!,
                        password: e.target.value || undefined,
                      },
                    })
                  }
                  placeholder="Auto-generate"
                  minLength={8}
                />
              </FormField>
            </div>
          )}
        </div>
      )}

      {/* Footer navigation */}
      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4">
        {step === 0 ? (
          <Button variant="outline" type="button" onClick={onCancel}>
            Cancel
          </Button>
        ) : (
          <Button
            variant="outline"
            type="button"
            onClick={() => goTo(step - 1)}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        )}

        {step < lastStep ? (
          <Button type="submit" rightIcon={<ArrowRight className="h-4 w-4" />}>
            Next
          </Button>
        ) : (
          <Button type="submit" loading={submitting}>
            {submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}
