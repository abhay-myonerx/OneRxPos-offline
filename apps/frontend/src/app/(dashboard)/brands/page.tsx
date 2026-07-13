"use client";

import { useState } from "react";
import { Plus, Edit, Tag, Archive, RotateCcw, ExternalLink } from "lucide-react";

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
  useListBrandsQuery,
  useCreateBrandMutation,
  useUpdateBrandMutation,
  useDeactivateBrandMutation,
  useRestoreBrandMutation,
} from "@/features/products/api/brands.api";
import type {
  Brand,
  CreateBrandInput,
  ArchivedFilter,
} from "@/features/products/types/brand.types";

const EMPTY: CreateBrandInput = {
  name: "",
  slug: "",
  description: "",
  logo: "",
  website: "",
};

export default function BrandsPage() {
  const { can } = usePermissions();
  // Read and manage are separate — a viewer role can see brands without being
  // able to create or edit them (e.g. a sales rep browsing the catalog).
  const canRead = can("brands.read");
  const canManage = can("brands.manage");

  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateBrandInput>(EMPTY);
  const [pendingArchive, setPendingArchive] = useState<Brand | null>(null);

  const { data, isLoading, isError, refetch } = useListBrandsQuery(
    { search: search || undefined, archived },
    { skip: !canRead },
  );

  const [create, { isLoading: creating }] = useCreateBrandMutation();
  const [update, { isLoading: updating }] = useUpdateBrandMutation();
  const [deactivate, { isLoading: deactivating }] = useDeactivateBrandMutation();
  const [restore] = useRestoreBrandMutation();

  if (!canRead) {
    return (
      <PermissionDenied
        title="You don't have permission to view brands."
        missingPermission="brands.read"
      />
    );
  }

  const items = data?.data ?? [];

  function openNew() {
    setForm(EMPTY);
    setEditId(null);
    setModalOpen(true);
  }

  function openEdit(b: Brand) {
    setForm({
      name: b.name,
      slug: b.slug,
      description: b.description ?? "",
      logo: b.logo ?? "",
      website: b.website ?? "",
    });
    setEditId(b.id);
    setModalOpen(true);
  }

  // ── Handlers ──

  function buildPayload(input: CreateBrandInput): CreateBrandInput {
    // Strip empty strings before sending — the backend Zod schema rejects ""
    // for url-typed fields. The server auto-derives slug from name when absent.
    return {
      name: input.name,
      slug: input.slug?.trim() ? input.slug.trim() : undefined,
      description: input.description?.trim() ? input.description : null,
      logo: input.logo?.trim() ? input.logo : null,
      website: input.website?.trim() ? input.website : null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = buildPayload(form);
      if (editId) {
        await update({ id: editId, data: payload }).unwrap();
        showSuccess("Brand updated");
      } else {
        await create(payload).unwrap();
        showSuccess("Brand created");
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
      showSuccess("Brand deactivated");
      setPendingArchive(null);
    } catch (err) {
      showApiError(err);
    }
  }

  async function handleRestore(id: string) {
    try {
      await restore(id).unwrap();
      showSuccess("Brand restored");
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Brands"
        actions={
          canManage ? (
            <Button onClick={openNew} icon={<Plus className="h-4 w-4" />}>
              New Brand
            </Button>
          ) : null
        }
      />

      <Card className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <Input
            placeholder="Search by name or slug…"
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
        <ErrorDisplay message="Failed to load brands" onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <Empty
          title="No brands yet"
          description={
            canManage
              ? "Create your first brand to start tagging products."
              : "Ask a catalog admin to set up brands."
          }
          icon={<Tag className="h-7 w-7 text-slate-400 dark:text-slate-500" />}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((b) => (
            <Card key={b.id}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  {b.logo ? (
                    <img
                      src={b.logo}
                      alt=""
                      className="h-10 w-10 rounded object-cover border border-slate-200 dark:border-slate-800"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Tag className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                      {b.name}
                    </p>
                    <code className="text-xs text-slate-400 dark:text-slate-500 truncate block">
                      {b.slug}
                    </code>
                  </div>
                </div>
                <Badge variant={b.isActive ? "success" : "danger"}>
                  {b.isActive ? "Active" : "Archived"}
                </Badge>
              </div>
              {b.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">
                  {b.description}
                </p>
              )}
              {b.website && (
                <a
                  href={b.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline mb-3"
                >
                  Website <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {b._count && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                  {b._count.products} product
                  {b._count.products === 1 ? "" : "s"}
                </p>
              )}
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(b)}
                    icon={<Edit className="h-3.5 w-3.5" />}
                  >
                    Edit
                  </Button>
                  {b.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingArchive(b)}
                      icon={<Archive className="h-3.5 w-3.5" />}
                    >
                      Archive
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(b.id)}
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
        title={editId ? "Edit Brand" : "New Brand"}
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
            <FormField
              label="Slug"
              hint="Lowercase letters, digits, hyphens. Leave blank to derive from name."
            >
              <Input
                value={form.slug ?? ""}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                placeholder="auto"
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Logo URL">
              <Input
                type="url"
                value={form.logo ?? ""}
                onChange={(e) => setForm({ ...form, logo: e.target.value })}
                placeholder="https://…"
              />
            </FormField>
            <FormField label="Website">
              <Input
                type="url"
                value={form.website ?? ""}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://…"
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
        open={!!pendingArchive}
        onClose={() => setPendingArchive(null)}
        onConfirm={handleArchive}
        title="Archive this brand?"
        description={
          pendingArchive
            ? `"${pendingArchive.name}" will be hidden from active lists. You can restore it later. If any active products still reference it, the operation will be blocked.`
            : ""
        }
        confirmLabel="Archive"
        variant="warning"
        loading={deactivating}
      />
    </>
  );
}
