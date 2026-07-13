"use client";

import { useState } from "react";
import { ScrollText, Plus, ExternalLink } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form/form-field";
import { Modal } from "@/components/ui/modal";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";

import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useCreateEmployeeContractMutation,
  useListEmployeeContractsQuery,
} from "@/features/hr/api/employees.api";
import { useListDepartmentsQuery } from "@/features/hr/api/departments.api";
import { useListDesignationsQuery } from "@/features/hr/api/designations.api";
import type {
  CreateContractInput,
  EmploymentContract,
  EmploymentType,
} from "@/features/hr/types/hr.types";

const EMPLOYMENT_TYPES: ReadonlyArray<EmploymentType> = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CONSULTANT",
];

interface Props {
  employeeId: string;
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleDateString() : "—";
}

function PanelShell({
  children,
  action,
  description,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  description?: string;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ScrollText className="mt-0.5 h-5 w-5 text-slate-400 dark:text-slate-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Employment contracts
            </h3>
            {description && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

export function EmployeeContractsPanel({ employeeId }: Props) {
  const { can } = usePermissions();
  const canRead = can("hr.contracts.read");
  const canCreate = can("hr.contracts.create");

  const { data, isLoading, isError, refetch } = useListEmployeeContractsQuery(
    { id: employeeId, limit: 100 },
    { skip: !canRead },
  );

  const [creating, setCreating] = useState<{
    open: boolean;
    supersedesId: string | null;
  }>({ open: false, supersedesId: null });

  if (!canRead) {
    return (
      <PanelShell description="Restricted to roles with hr.contracts.read.">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You don&apos;t have access to this employee&apos;s contracts.
        </p>
      </PanelShell>
    );
  }

  if (isLoading) {
    return (
      <PanelShell>
        <Loading />
      </PanelShell>
    );
  }

  if (isError) {
    return (
      <PanelShell>
        <ErrorDisplay message="Failed to load contracts" onRetry={() => refetch()} />
      </PanelShell>
    );
  }

  const contracts: EmploymentContract[] = data?.data ?? [];
  const supersedingIds = new Set(contracts.map((c) => c.supersedesId).filter(Boolean) as string[]);
  const activeContract = contracts.find((c) => !supersedingIds.has(c.id) && !c.effectiveTo);

  return (
    <PanelShell
      description="Append-only chain. Promotions, transfers, and renewals create a new contract that supersedes the previous one."
      action={
        canCreate && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCreating({
                open: true,
                supersedesId: activeContract?.id ?? null,
              })
            }
            icon={<Plus className="h-4 w-4" />}
          >
            New contract
          </Button>
        )
      }
    >
      {contracts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No contracts on file yet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {contracts.map((c) => {
            const isActive = c === activeContract;
            return (
              <li
                key={c.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-slate-800 dark:text-slate-100">
                      {c.title}
                    </strong>
                    <Badge variant="default">{c.employmentType.replace(/_/g, " ")}</Badge>
                    {isActive && <Badge variant="success">Current</Badge>}
                    {c.contractNumber && (
                      <code className="text-xs text-slate-400 dark:text-slate-500">
                        #{c.contractNumber}
                      </code>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {fmtDate(c.effectiveFrom)} →{" "}
                    {c.effectiveTo ? fmtDate(c.effectiveTo) : "ongoing"}
                  </p>
                  {c.notes && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{c.notes}</p>
                  )}
                </div>
                {c.documentUrl && (
                  <a
                    href={c.documentUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-300 hover:text-primary-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    PDF
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canCreate && (
        <CreateContractModal
          employeeId={employeeId}
          supersedesId={creating.supersedesId}
          open={creating.open}
          onClose={() => setCreating({ open: false, supersedesId: null })}
        />
      )}
    </PanelShell>
  );
}

function CreateContractModal({
  employeeId,
  supersedesId,
  open,
  onClose,
}: {
  employeeId: string;
  supersedesId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: deptData } = useListDepartmentsQuery(
    { limit: 100, archived: "active" },
    { skip: !open },
  );
  const { data: desigData } = useListDesignationsQuery(
    { limit: 100, archived: "active" },
    { skip: !open },
  );

  const [form, setForm] = useState<CreateContractInput>({
    title: "",
    employmentType: "FULL_TIME",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });

  const [createContract, { isLoading }] = useCreateEmployeeContractMutation();

  function patch(p: Partial<CreateContractInput>) {
    setForm((s) => ({ ...s, ...p }));
  }

  async function handleSave() {
    if (!form.title || !form.effectiveFrom) return;
    try {
      await createContract({
        id: employeeId,
        data: { ...form, ...(supersedesId ? { supersedesId } : {}) },
      }).unwrap();
      showSuccess("Contract created");
      onClose();
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New employment contract"
      description={
        supersedesId
          ? "Will supersede the current active contract. The previous contract's end date is set automatically."
          : "First contract for this employee — nothing is superseded."
      }
      size="md"
      primaryAction={{
        label: "Create contract",
        onClick: handleSave,
        loading: isLoading,
        disabled: !form.title || !form.effectiveFrom,
      }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}
    >
      <div className="space-y-4">
        <FormField label="Title / position" required>
          <Input
            value={form.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="e.g. Senior Sales Associate"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Contract number" hint="Operator-assigned reference.">
            <Input
              value={form.contractNumber ?? ""}
              onChange={(e) => patch({ contractNumber: e.target.value || null })}
            />
          </FormField>
          <FormField label="Employment type" required>
            <Select
              value={form.employmentType}
              onValueChange={(v) => patch({ employmentType: v as EmploymentType })}
              options={EMPLOYMENT_TYPES.map((t) => ({
                value: t,
                label: t.replace(/_/g, " "),
              }))}
            />
          </FormField>
          <FormField label="Department">
            <Select
              value={form.departmentId ?? ""}
              onValueChange={(v) => patch({ departmentId: (v as string) || null })}
              placeholder="(unchanged)"
              options={(deptData?.data ?? []).map((d) => ({
                value: d.id,
                label: `${d.name} (${d.code})`,
              }))}
            />
          </FormField>
          <FormField label="Designation">
            <Select
              value={form.designationId ?? ""}
              onValueChange={(v) => patch({ designationId: (v as string) || null })}
              placeholder="(unchanged)"
              options={(desigData?.data ?? []).map((d) => ({
                value: d.id,
                label: `${d.title} (${d.code})`,
              }))}
            />
          </FormField>
          <FormField label="Effective from" required>
            <Input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => patch({ effectiveFrom: e.target.value })}
            />
          </FormField>
          <FormField label="Effective to" hint="Leave blank for open-ended.">
            <Input
              type="date"
              value={form.effectiveTo ?? ""}
              onChange={(e) => patch({ effectiveTo: e.target.value || null })}
            />
          </FormField>
        </div>
        <FormField label="Signed document URL" hint="Cloudinary / S3 URL — uploaded separately.">
          <Input
            type="url"
            value={form.documentUrl ?? ""}
            onChange={(e) => patch({ documentUrl: e.target.value || null })}
            placeholder="https://…"
          />
        </FormField>
        <FormField label="Notes">
          <Textarea
            value={form.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value || null })}
            rows={3}
          />
        </FormField>
      </div>
    </Modal>
  );
}
