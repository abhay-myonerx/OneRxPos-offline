"use client";

import { useState } from "react";
import { Plus, Edit, IdCard, Archive, RotateCcw } from "lucide-react";

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
  useListDesignationsQuery,
  useCreateDesignationMutation,
  useUpdateDesignationMutation,
  useDeactivateDesignationMutation,
  useRestoreDesignationMutation,
} from "@/features/hr/api/designations.api";
import type {
  Designation,
  CreateDesignationInput,
  ArchivedFilter,
} from "@/features/hr/types/hr.types";

const EMPTY: CreateDesignationInput = {
  title: "",
  code: "",
  level: null,
  description: "",
};

export default function DesignationsPage() {
  const { can } = usePermissions();
  const canRead = can("hr.designations.read");
  const canManage = can("hr.designations.manage");

  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateDesignationInput>(EMPTY);
  const [pendingArchive, setPendingArchive] = useState<Designation | null>(null);

  const { data, isLoading, isError, refetch } = useListDesignationsQuery(
    { search: search || undefined, archived, limit: 100 },
    { skip: !canRead },
  );

  const [create, { isLoading: creating }] = useCreateDesignationMutation();
  const [update, { isLoading: updating }] = useUpdateDesignationMutation();
  const [deactivate, { isLoading: deactivating }] = useDeactivateDesignationMutation();
  const [restore] = useRestoreDesignationMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view designations."
        missingPermission="hr.designations.read"
      />
    );
  }

  const items = data?.data ?? [];

  function openNew() {
    setForm(EMPTY);
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(d: Designation) {
    setForm({
      title: d.title,
      code: d.code,
      level: d.level,
      description: d.description ?? "",
    });
    setEditId(d.id);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: CreateDesignationInput = {
        ...form,
        level: form.level === null || form.level === undefined ? null : Number(form.level),
      };
      if (editId) {
        await update({ id: editId, data: payload }).unwrap();
        showSuccess("Designation updated");
      } else {
        await create(payload).unwrap();
        showSuccess("Designation created");
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
      showSuccess("Designation deactivated");
      setPendingArchive(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleRestore(id: string) {
    try {
      await restore(id).unwrap();
      showSuccess("Designation restored");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Designations"
        actions={
          canManage ? (
            <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
              New Designation
            </Button>
          ) : null
        }
      />

      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            placeholder="Search by title or code…"
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
        <ErrorDisplay message="Failed to load designations" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="No designations yet"
          description={
            canManage
              ? "Create your first job title (e.g. Cashier, Manager, Cook)."
              : "Ask an HR admin to set up designations."
          }
          icon={<IdCard className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((d) => (
            <Card key={d.id}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{d.title}</p>
                  <code className="text-xs text-slate-400 dark:text-slate-500">{d.code}</code>
                  {d.level !== null && (
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                      Level {d.level}
                    </span>
                  )}
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
        title={editId ? "Edit Designation" : "New Designation"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Title" required>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </FormField>
            <FormField label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. CASHIER"
                required
              />
            </FormField>
          </div>
          <FormField
            label="Level"
            hint="1 = junior, 5 = senior. Drives policy defaults later (optional)."
          >
            <Input
              type="number"
              min={1}
              max={20}
              value={form.level === null || form.level === undefined ? "" : form.level}
              onChange={(e) =>
                setForm({
                  ...form,
                  level: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </FormField>
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
        title="Archive this designation?"
        description={
          pendingArchive
            ? `"${pendingArchive.title}" will be hidden from active lists. If any active employees still hold this title, the operation will be blocked.`
            : ""
        }
        confirmLabel="Archive"
        variant="warning"
        loading={deactivating}
      />
    </>
  );
}
