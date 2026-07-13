"use client";

/**
 * Supplier directory: paginated list with search and sort, inline create/edit
 * modal, and a destructive delete with confirmation.
 * A positive `balance` means the business owes the supplier (AP payable) and
 * is rendered in danger color as a visual prompt to settle outstanding amounts.
 */
import { useState } from "react";
import { Plus, Search, Edit, Trash2, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  useListSuppliersQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
} from "@/features/suppliers/api/suppliers.api";
import { formatMoney } from "@/lib/currency/format-money";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type { CreateSupplierInput } from "@/features/suppliers/types/supplier.types";

const emptyForm: CreateSupplierInput = { name: "" };

export default function SuppliersPage() {
  // ── Filter / sort / pagination state ──
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "balance">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateSupplierInput>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Queries & mutations ──
  const { data, isLoading, isError, refetch } = useListSuppliersQuery({
    search: search || undefined,
    page,
    limit: 20,
    sortBy,
    sortOrder,
  });
  const [create, { isLoading: creating }] = useCreateSupplierMutation();
  const [update, { isLoading: updating }] = useUpdateSupplierMutation();
  const [remove, { isLoading: deleting }] = useDeleteSupplierMutation();

  const suppliers = data?.data || [];
  const pagination = data?.pagination;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await update({ id: editId, data: form }).unwrap();
        showSuccess("Supplier updated");
      } else {
        await create(form).unwrap();
        showSuccess("Supplier created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const openEdit = (s: (typeof suppliers)[0]) => {
    setForm({
      name: s.name,
      contactName: s.contactName,
      email: s.email,
      phone: s.phone,
      address: s.address,
      taxId: s.taxId,
    });
    setEditId(s.id);
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

  const setField = (k: keyof CreateSupplierInput, v: string | null) => setForm({ ...form, [k]: v });

  if (isLoading) return <Loading />;
  if (isError)
    return <ErrorDisplay message="Failed to load suppliers." onRetry={() => refetch()} />;
  return (
    <>
      <PageHeader
        title="Suppliers"
        description={`${pagination?.total || 0} suppliers`}
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setEditId(null);
              setModalOpen(true);
            }}
            icon={<Plus className="h-4 w-4" />}
          >
            Add Supplier
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Search suppliers..."
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
              { value: "createdAt", label: "Date" },
              { value: "name", label: "Name" },
              { value: "balance", label: "Balance" },
            ]}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="sm:max-w-[140px]"
          />
          <Select
            options={[
              { value: "desc", label: "Desc" },
              { value: "asc", label: "Asc" },
            ]}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
            className="sm:max-w-[100px]"
          />
        </div>

        {!suppliers.length ? (
          <Empty
            title="No suppliers"
            icon={<Truck className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Tax ID</Th>
                <Th>Balance</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {suppliers.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td>{s.contactName || "—"}</Td>
                  <Td>{s.phone || "—"}</Td>
                  <Td className="text-xs">{s.email || "—"}</Td>
                  <Td className="text-xs">{s.taxId || "—"}</Td>
                  <Td>
                    {parseFloat(s.balance) > 0 ? (
                      <span className="text-danger-600 font-medium">{formatMoney(s.balance)}</span>
                    ) : (
                      formatMoney(s.balance)
                    )}
                  </Td>
                  <Td>
                    <Badge variant={s.isActive ? "success" : "danger"}>
                      {s.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Supplier" : "New Supplier"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Supplier Name" required>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </FormField>
          <FormField label="Contact Person">
            <Input
              value={form.contactName || ""}
              onChange={(e) => setField("contactName", e.target.value || null)}
            />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Phone">
              <Input
                value={form.phone || ""}
                onChange={(e) => setField("phone", e.target.value || null)}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={form.email || ""}
                onChange={(e) => setField("email", e.target.value || null)}
              />
            </FormField>
          </div>
          <FormField label="Tax ID">
            <Input
              value={form.taxId || ""}
              onChange={(e) => setField("taxId", e.target.value || null)}
            />
          </FormField>
          <FormField label="Address">
            <Input
              value={form.address || ""}
              onChange={(e) => setField("address", e.target.value || null)}
            />
          </FormField>
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
        title="Delete Supplier?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be permanently deleted. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
