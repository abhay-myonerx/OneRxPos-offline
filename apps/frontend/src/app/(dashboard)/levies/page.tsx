"use client";

/**
 * Levy directory (Phase 1.2 Pricing Brain): paginated list with search/sort,
 * inline create/edit modal, and a destructive delete (soft-deactivate on the
 * backend) with confirmation. Structure mirrors `suppliers/page.tsx`.
 *
 * Also hosts the read-only tax-rules viewer so admins can look up a
 * province's federal/provincial tax components (facts from `rx-pos-shared`,
 * not editable here) right next to the levies they configure on top of them.
 */
import { useState } from "react";
import { Plus, Search, Edit, Trash2, Percent } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import {
  useListLeviesQuery,
  useCreateLevyMutation,
  useUpdateLevyMutation,
  useDeleteLevyMutation,
} from "@/features/levies/api/levies.api";
import { TaxRulesViewer } from "@/features/levies/components/TaxRulesViewer";
import { LEVY_MODE_OPTIONS } from "@/features/levies/types/levy.types";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { CreateLevyInput } from "@/features/levies/types/levy.types";

const emptyForm: CreateLevyInput = {
  code: "",
  name: "",
  mode: "FLAT_PER_UNIT",
  amount: 0,
  taxable: true,
};

export default function LeviesPage() {
  // ── Filter / sort / pagination state ──
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "code" | "amount">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateLevyInput>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Queries & mutations ──
  const { data, isLoading, isError, refetch } = useListLeviesQuery({
    search: search || undefined,
    page,
    limit: 20,
    sortBy,
    sortOrder,
  });
  const [create, { isLoading: creating }] = useCreateLevyMutation();
  const [update, { isLoading: updating }] = useUpdateLevyMutation();
  const [remove, { isLoading: deleting }] = useDeleteLevyMutation();

  const levies = data?.data || [];
  const pagination = data?.pagination;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: CreateLevyInput = {
        ...form,
        effectiveFrom: form.effectiveFrom || undefined,
        effectiveTo: form.effectiveTo || undefined,
      };
      if (editId) {
        await update({ id: editId, data: payload }).unwrap();
        showSuccess("Levy updated");
      } else {
        await create(payload).unwrap();
        showSuccess("Levy created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const openEdit = (levy: (typeof levies)[0]) => {
    setForm({
      code: levy.code,
      name: levy.name,
      mode: levy.mode,
      amount: parseFloat(levy.amount),
      taxable: levy.taxable,
      effectiveFrom: levy.effectiveFrom ? levy.effectiveFrom.slice(0, 10) : undefined,
      effectiveTo: levy.effectiveTo ? levy.effectiveTo.slice(0, 10) : undefined,
    });
    setEditId(levy.id);
    setModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id).unwrap();
      showSuccess("Deleted");
      setDeleteTarget(null);
    } catch (err) {
      showApiError(err);
    }
  };

  const setField = <K extends keyof CreateLevyInput>(k: K, v: CreateLevyInput[K]) =>
    setForm({ ...form, [k]: v });

  if (isLoading) return <Loading />;
  if (isError) return <ErrorDisplay message="Failed to load levies." onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Levies"
        description={`${pagination?.total || 0} levies`}
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setEditId(null);
              setModalOpen(true);
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            Add Levy
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search levies..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            icon={<Search className="h-4 w-4" />}
            className="sm:max-w-xs"
          />
          <Select
            options={[
              { value: "name", label: "Name" },
              { value: "code", label: "Code" },
              { value: "amount", label: "Amount" },
              { value: "createdAt", label: "Date" },
            ]}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="sm:max-w-[140px]"
          />
          <Select
            options={[
              { value: "asc", label: "Asc" },
              { value: "desc", label: "Desc" },
            ]}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
            className="sm:max-w-[100px]"
          />
        </div>

        {!levies.length ? (
          <Empty
            title="No levies"
            icon={<Percent className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Mode</Th>
                <Th>Amount</Th>
                <Th>Taxable</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {levies.map((levy) => (
                <Tr key={levy.id}>
                  <Td>
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded font-mono">
                      {levy.code}
                    </code>
                  </Td>
                  <Td className="font-medium">{levy.name}</Td>
                  <Td>
                    <Badge variant="outline">
                      {LEVY_MODE_OPTIONS.find((o) => o.value === levy.mode)?.label ?? levy.mode}
                    </Badge>
                  </Td>
                  <Td className="tabular-nums">
                    {levy.mode === "PERCENT" ? `${levy.amount}%` : levy.amount}
                  </Td>
                  <Td>
                    <Badge variant={levy.taxable ? "info" : "default"}>
                      {levy.taxable ? "Yes" : "No"}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={levy.isActive ? "success" : "danger"}>
                      {levy.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(levy)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget({ id: levy.id, name: levy.name })}
                    >
                      <Trash2 className="h-4 w-4 text-danger-500" />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
        {pagination && pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1">
          Tax rules by province
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Reference only — these federal/provincial rates come from the shared
          pricing engine and cannot be edited here.
        </p>
        <TaxRulesViewer />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Levy" : "New Levy"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Code" required>
              <Input
                value={form.code}
                onChange={(e) => setField("code", e.target.value.toUpperCase())}
                placeholder="e.g. ECO_FEE"
              />
            </FormField>
            <FormField label="Name" required>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Mode" required>
              <Select
                options={LEVY_MODE_OPTIONS}
                value={form.mode}
                onChange={(e) => setField("mode", e.target.value as CreateLevyInput["mode"])}
              />
            </FormField>
            <FormField
              label="Amount"
              required
              hint={form.mode === "PERCENT" ? "Percent (e.g. 5 = 5%)" : "Dollars"}
            >
              <Input
                type="number"
                step="0.0001"
                value={form.amount}
                onChange={(e) => setField("amount", parseFloat(e.target.value) || 0)}
              />
            </FormField>
          </div>

          <Checkbox
            label="Taxable (the levy amount itself attracts tax)"
            checked={form.taxable}
            onChange={(e) => setField("taxable", e.target.checked)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Effective From">
              <Input
                type="date"
                value={form.effectiveFrom || ""}
                onChange={(e) => setField("effectiveFrom", e.target.value || undefined)}
              />
            </FormField>
            <FormField label="Effective To">
              <Input
                type="date"
                value={form.effectiveTo || ""}
                onChange={(e) => setField("effectiveTo", e.target.value || undefined)}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
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
        open={deleteTarget !== null}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Levy?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be deactivated and no longer applied to new sales.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
