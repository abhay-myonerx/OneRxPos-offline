"use client";

import { useState } from "react";
import { Plus, Edit, Building2, Archive, RotateCcw } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

import {
  useListDepartmentsQuery,
  useCreateDepartmentMutation,
  useUpdateDepartmentMutation,
  useDeactivateDepartmentMutation,
  useRestoreDepartmentMutation,
} from "@/features/hr/api/departments.api";
import type {
  Department,
  CreateDepartmentInput,
  ArchivedFilter,
} from "@/features/hr/types/hr.types";

const EMPTY: CreateDepartmentInput = { name: "", code: "", description: "" };

export default function DepartmentsPage() {
  const { can } = usePermissions();
  const canRead = can("hr.departments.read");
  const canManage = can("hr.departments.manage");

  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDepartmentInput>(EMPTY);
  const [pendingArchive, setPendingArchive] = useState<Department | null>(null);

  const { data, isLoading, isError, refetch } = useListDepartmentsQuery(
    { search: search || undefined, archived, limit: 100 },
    { skip: !canRead },
  );

  const [create, { isLoading: creating }] = useCreateDepartmentMutation();
  const [update, { isLoading: updating }] = useUpdateDepartmentMutation();
  const [deactivate, { isLoading: deactivating }] = useDeactivateDepartmentMutation();
  const [restore] = useRestoreDepartmentMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view departments."
        missingPermission="hr.departments.read"
      />
    );
  }

  const items = data?.data ?? [];

  function openNew() {
    setForm(EMPTY);
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setForm({ name: d.name, code: d.code, description: d.description ?? "" });
    setEditId(d.id);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editId) {
        await update({ id: editId, data: form }).unwrap();
        showSuccess("Department updated");
      } else {
        await create(form).unwrap();
        showSuccess("Department created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleArchive() {
    if (!pendingArchive) return;
    try {
      await deactivate(pendingArchive.id).unwrap();
      showSuccess("Department deactivated");
      setPendingArchive(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleRestore(id: string) {
    try {
      await restore(id).unwrap();
      showSuccess("Department restored");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Departments"
        actions={
          canManage ? (
            <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
              New Department
            </Button>
          ) : null
        }
      />

      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            placeholder="Search by name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:flex-1"
          />
          <Select
            value={archived}
            onValueChange={(v) => setArchived(v as ArchivedFilter)}
            options={[
              { value: "active", label: "Active only" },
              { value: "archived", label: "Archived only" },
              { value: "any", label: "All" },
            ]}
          />
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <ErrorDisplay message="Failed to load departments" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="No departments yet"
          description={
            canManage
              ? "Create your first department to start grouping employees."
              : "Ask an HR admin to set up departments."
          }
          icon={<Building2 className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{d.name}</p>
                  <code className="text-xs text-slate-400 dark:text-slate-500">{d.code}</code>
                </div>
                <Badge variant={d.isActive ? "success" : "danger"}>
                  {d.isActive ? "Active" : "Archived"}
                </Badge>
              </div>
              {d.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                  {d.description}
                </p>
              )}
              {d._count && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {d._count.employees} employee
                  {d._count.employees === 1 ? "" : "s"}
                </p>
              )}
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(d)}
                    icon={<Edit className="h-3.5 w-3.5" />}
                  >
                    Edit
                  </Button>
                  {d.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingArchive(d)}
                      icon={<Archive className="h-3.5 w-3.5" />}
                    >
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(d.id)}
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                    >
                      Restore
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Department" : "New Department"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. KITCHEN"
                required
              />
            </FormField>
          </div>
          <FormField label="Description">
            <Textarea
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </FormField>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!pendingArchive}
        onClose={() => setPendingArchive(null)}
        onConfirm={handleArchive}
        title="Archive this department?"
        description={
          pendingArchive
            ? `"${pendingArchive.name}" will be hidden from active lists. You can restore it later. If any active employees still reference it, the operation will be blocked.`
            : ""
        }
        confirmLabel="Archive"
        variant="warning"
        loading={deactivating}
      />
    </>
  );
}
