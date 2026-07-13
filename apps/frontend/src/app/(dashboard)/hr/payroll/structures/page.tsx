// Salary structure catalogue — each structure is a named template (e.g. "Basic BD")
// that groups an ordered list of salary components (earnings, deductions, statutory).
// Employees are assigned a structure + basic-pay amount; the payroll engine uses
// `displayOrder` and `calcMethod` to derive gross → deductions → net for each payslip.
//
// Deactivating a structure does NOT affect existing salary assignments or payslips —
// it only prevents the structure from being selected for new assignments.
"use client";

import { useState } from "react";
import { Link } from "@/shell/nav";
import { Plus, Edit, Archive, Building2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { PermissionDenied } from "@/components/shared/auth/PermissionDenied";
import { usePermissions } from "@/hooks/usePermissions";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { ROUTES } from "@/constants/routes";
import {
  useListSalaryStructuresQuery,
  useCreateSalaryStructureMutation,
  useUpdateSalaryStructureMutation,
  useDeactivateSalaryStructureMutation,
} from "@/features/hr/api/payroll.api";
import type {
  SalaryStructure,
  CreateSalaryStructureInput,
} from "@/features/hr/types/payroll.types";

const EMPTY: CreateSalaryStructureInput = {
  name: "",
  code: "",
  countryCode: null,
};

export default function SalaryStructuresPage() {
  const { can, canAny } = usePermissions();
  const canRead = canAny("hr.payroll.salary-structure.read", "hr.payroll.salary-structure.manage");
  const canManage = can("hr.payroll.salary-structure.manage");

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryStructure | null>(null);
  const [form, setForm] = useState<CreateSalaryStructureInput>(EMPTY);
  const [pendingDeactivate, setPendingDeactivate] = useState<SalaryStructure | null>(null);

  const { data, isLoading, isError, refetch } = useListSalaryStructuresQuery(
    {
      search: search.trim() || undefined,
      ...(showInactive ? {} : { isActive: true }),
    },
    { skip: !canRead },
  );
  const [create, { isLoading: creating }] = useCreateSalaryStructureMutation();
  const [update, { isLoading: updating }] = useUpdateSalaryStructureMutation();
  const [deactivate, { isLoading: deactivating }] = useDeactivateSalaryStructureMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view salary structures."
        missingPermission="hr.payroll.salary-structure.read"
      />
    );
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }
  function openEdit(s: SalaryStructure) {
    setEditing(s);
    setForm({ name: s.name, code: s.code, countryCode: s.countryCode });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await update({
          id: editing.id,
          data: { name: form.name, countryCode: form.countryCode },
        }).unwrap();
        showSuccess("Structure updated");
      } else {
        await create(form).unwrap();
        showSuccess("Structure created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleDeactivate() {
    if (!pendingDeactivate) return;
    try {
      await deactivate(pendingDeactivate.id).unwrap();
      showSuccess("Structure deactivated");
      setPendingDeactivate(null);
    } catch (err) {
      showApiError(err);
    }
  }

  const items = data?.data ?? [];

  return (
    <>
      <PageHeader
        title="Salary structures"
        actions={
          canManage ? (
            <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
              New structure
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-6" padding={false}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input
            placeholder="Search name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:flex-1"
          />
          <Checkbox
            label="Include inactive"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Could not load salary structures." onRetry={refetch} />
      ) : items.length === 0 ? (
        <Empty
          title="No structures yet"
          message="Create one to configure payroll."
          icon={<Building2 className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          action={
            canManage ? (
              <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
                New structure
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            const count = s.components?.length ?? 0;
            return (
              <Card key={s.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</h3>
                    <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
                      {s.code}
                      {s.countryCode ? ` · ${s.countryCode}` : ""}
                    </p>
                  </div>
                  <Badge variant={s.isActive ? "success" : "outline"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {count} component{count !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${ROUTES.HR_PAYROLL_STRUCTURES}/${s.id}`}>Components</Link>
                  </Button>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(s)}
                        icon={<Edit className="h-4 w-4" />}
                      >
                        Edit
                      </Button>
                      {s.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeactivate(s)}
                          icon={<Archive className="h-4 w-4" />}
                        />
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit structure" : "New structure"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={100}
            />
          </FormField>
          {!editing && (
            <FormField label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="BASIC_BD"
                required
                maxLength={50}
              />
            </FormField>
          )}
          <FormField label="Country code">
            <Input
              value={form.countryCode ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  countryCode: e.target.value.toUpperCase() || null,
                })
              }
              placeholder="US"
              maxLength={2}
            />
          </FormField>
          <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingDeactivate}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={handleDeactivate}
        title="Deactivate structure?"
        description={
          pendingDeactivate
            ? `"${pendingDeactivate.name}" — existing assignments are unaffected.`
            : ""
        }
        confirmLabel="Deactivate"
        variant="warning"
        loading={deactivating}
      />
    </>
  );
}
