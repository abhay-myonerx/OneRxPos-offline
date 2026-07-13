"use client";

import { useState } from "react";
import {
  Plus,
  FolderTree,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search,
  Package,
  Layers,
  CheckCircle2,
  CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/container";
import { FormField } from "@/components/ui/form/form-field";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/feedback/Loading";
import { Empty } from "@/components/shared/feedback/Empty";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import {
  useListCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
} from "@/features/products/api/categories.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/features/products/types/category.types";

/** Small always-visible row action — subtle by default, tinted on hover. */
function RowAction({
  icon,
  label,
  tone = "neutral",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "neutral" | "primary" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "h-8 w-8 inline-flex items-center justify-center rounded-lg transition-colors",
        "text-slate-400 dark:text-slate-500",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
        tone === "primary" &&
          "hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-300 dark:hover:bg-primary-400/10",
        tone === "danger" &&
          "hover:text-danger-600 hover:bg-danger-50 dark:hover:text-danger-400 dark:hover:bg-danger-500/15",
        tone === "neutral" &&
          "hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800",
      )}
    >
      {icon}
    </button>
  );
}

function CategoryRow({
  category,
  depth = 0,
  allCategories,
  onEdit,
  onDelete,
  onAddSub,
}: {
  category: Category;
  depth?: number;
  allCategories: Category[];
  onEdit: (cat: Category) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = !!(category.children && category.children.length > 0);
  const productCount = category._count?.products ?? 0;
  const childCount = category.children?.length ?? 0;

  return (
    <div className="animate-fade-in">
      <div
        className="group flex items-center gap-2.5 sm:gap-3 py-2.5 pr-2 sm:pr-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        style={{ paddingLeft: `${16 + depth * 28}px` }}
      >
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
            className="h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}

        {/* Icon */}
        <div
          className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
            depth === 0
              ? "bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300"
              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
          )}
        >
          <FolderTree className="h-4 w-4" />
        </div>

        {/* Name & meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
              {category.name}
            </p>
            {!category.isActive && (
              <Badge variant="danger" className="text-[10px]">
                Inactive
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
              {category.slug}
            </span>
            {productCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                <Package className="h-3 w-3" />
                {productCount}
              </span>
            )}
            {childCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                <CornerDownRight className="h-3 w-3" />
                {childCount} sub
              </span>
            )}
          </div>
        </div>

        {/* Actions — always visible */}
        <div className="flex items-center gap-0.5 shrink-0">
          <RowAction
            icon={<Plus className="h-4 w-4" />}
            label="Add sub-category"
            tone="primary"
            onClick={() => onAddSub(category.id)}
          />
          <RowAction
            icon={<Edit className="h-4 w-4" />}
            label="Edit category"
            tone="neutral"
            onClick={() => onEdit(category)}
          />
          <RowAction
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete category"
            tone="danger"
            onClick={() => onDelete(category.id)}
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="ml-8 border-l border-slate-200/70 dark:border-slate-700/70">
          {category.children!.map((child) => (
            <CategoryRow
              key={child.id}
              category={child}
              depth={depth + 1}
              allCategories={allCategories}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddSub={onAddSub}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact stat tile for the categories overview header. */
function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", tint)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
          {value}
        </p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

/**
 * Hierarchical category manager rendered as an expandable tree.
 * The API returns the full tree in one call; client-side search recursively
 * matches on name/slug and preserves parent rows when a child matches.
 * Deleting a category orphans its sub-categories (backend behaviour) — the
 * confirm copy makes this explicit so users aren't surprised.
 */
export default function CategoriesPage() {
  const { data: categories, isLoading, error, refetch } = useListCategoriesQuery();
  const [createCategory, { isLoading: creating }] = useCreateCategoryMutation();
  const [updateCategory, { isLoading: updating }] = useUpdateCategoryMutation();
  const [deleteCategory, { isLoading: deletingCategory }] = useDeleteCategoryMutation();

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateCategoryInput & { isActive?: boolean }>({
    name: "",
    sortOrder: 0,
  });
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // ── Derived state ──

  // Flatten the tree once so we can populate the "Parent Category" select
  // and compute aggregate stats without re-traversing on every render.
  const flattenCategories = (cats: Category[]): Category[] => {
    const result: Category[] = [];
    for (const c of cats) {
      result.push(c);
      if (c.children?.length) result.push(...flattenCategories(c.children));
    }
    return result;
  };

  const allFlat = categories ? flattenCategories(categories) : [];
  const topLevel = categories || [];

  // Recursive match: a parent is kept in results if any descendant matches,
  // so the tree context is visible even when only a child matches the query.
  const matchesSearch = (cat: Category): boolean => {
    const q = search.toLowerCase();
    if (cat.name.toLowerCase().includes(q) || cat.slug.toLowerCase().includes(q)) return true;
    if (cat.children?.some(matchesSearch)) return true;
    return false;
  };
  const filteredCategories = search ? topLevel.filter(matchesSearch) : topLevel;

  const openCreate = (parentId?: string) => {
    setForm({ name: "", parentId: parentId || undefined, sortOrder: 0 });
    setEditId(null);
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setForm({
      name: cat.name,
      parentId: cat.parentId || undefined,
      sortOrder: cat.sortOrder,
      isActive: cat.isActive,
    });
    setEditId(cat.id);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        const updateData: UpdateCategoryInput = {
          name: form.name,
          parentId: form.parentId || null,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        };
        await updateCategory({ id: editId, data: updateData }).unwrap();
        showSuccess("Category updated");
      } else {
        await createCategory({
          name: form.name,
          parentId: form.parentId,
          sortOrder: form.sortOrder,
        }).unwrap();
        showSuccess("Category created");
      }
      setModalOpen(false);
    } catch (err) {
      showApiError(err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteCategory(deleteTargetId).unwrap();
      showSuccess("Category deleted");
      setDeleteTargetId(null);
    } catch (err) {
      showApiError(err);
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorDisplay onRetry={refetch} />;

  const totalCount = allFlat.length;
  const topLevelCount = topLevel.length;
  const activeCount = allFlat.filter((c) => c.isActive).length;
  const productTotal = allFlat.reduce((sum, c) => sum + (c._count?.products ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize your products into a structured catalog hierarchy"
        actions={
          <Button onClick={() => openCreate()} icon={<Plus className="h-4 w-4" />}>
            Add Category
          </Button>
        }
      />

      {/* Overview stats */}
      {totalCount > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatCard
            icon={<Layers className="h-5 w-5" />}
            label="Total categories"
            value={totalCount}
            tint="bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300"
          />
          <StatCard
            icon={<FolderTree className="h-5 w-5" />}
            label="Top-level"
            value={topLevelCount}
            tint="bg-accent-50 text-accent-600 dark:bg-accent-400/15 dark:text-accent-300"
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Active"
            value={activeCount}
            tint="bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"
          />
          <StatCard
            icon={<Package className="h-5 w-5" />}
            label="Tagged products"
            value={productTotal}
            tint="bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-300"
          />
        </div>
      )}

      <Card padding={false}>
        {/* Search bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="h-4 w-4" />}
            className="max-w-xs"
          />
        </div>

        {/* Category tree */}
        {filteredCategories.length === 0 ? (
          <Empty
            title={search ? "No matching categories" : "No categories yet"}
            message={
              search
                ? "Try a different search term"
                : "Create your first category to organize products"
            }
            icon={<FolderTree className="h-7 w-7 text-slate-400" />}
            action={
              !search ? (
                <Button size="sm" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" /> Add Category
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="py-2 divide-y divide-slate-100/60 dark:divide-slate-800/60">
            {filteredCategories.map((cat) => (
              <CategoryRow
                key={cat.id}
                category={cat}
                allCategories={allFlat}
                onEdit={openEdit}
                onDelete={(id) => setDeleteTargetId(id)}
                onAddSub={(parentId) => openCreate(parentId)}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? "Edit Category" : "New Category"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Category Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Electronics"
              autoFocus
            />
          </FormField>

          <FormField label="Parent Category">
            <Select
              options={allFlat
                // Exclude the category being edited to prevent self-parenting.
                .filter((c) => c.id !== editId)
                .map((c) => ({
                  value: c.id,
                  label: c.parentId ? `  ↳ ${c.name}` : c.name,
                }))}
              placeholder="None (top-level)"
              value={form.parentId || ""}
              onChange={(e) => setForm({ ...form, parentId: e.target.value || undefined })}
            />
          </FormField>

          <FormField label="Sort Order">
            <Input
              type="number"
              min={0}
              value={form.sortOrder ?? 0}
              onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
              placeholder="0"
            />
          </FormField>

          {editId && (
            <FormField label="Status">
              <Select
                options={[
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
                value={String(form.isActive ?? true)}
                onChange={(e) => setForm({ ...form, isActive: e.target.value === "true" })}
              />
            </FormField>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating || updating}>
              {editId ? "Update" : "Create"} Category
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTargetId !== null}
        onClose={() => !deletingCategory && setDeleteTargetId(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Category?"
        description="This category will be permanently deleted. Sub-categories will be orphaned."
        confirmLabel="Delete"
        variant="danger"
        loading={deletingCategory}
      />
    </>
  );
}
