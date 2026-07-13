"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form/form-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import {
  useCreateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
} from "../api/expenses.api";
import type { ExpenseCategory } from "../types/expense.types";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: ExpenseCategory[];
}

export function ExpenseCategoriesModal({ open, onClose, categories }: Props) {
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ExpenseCategory | null>(null);

  const [createCategory, { isLoading: creating }] = useCreateExpenseCategoryMutation();
  const [removeCategory, { isLoading: removing }] = useDeleteExpenseCategoryMutation();

  const handleClose = () => {
    setName("");
    setPendingDelete(null);
    onClose();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createCategory({ name: trimmed }).unwrap();
      showSuccess("Category created");
      setName("");
    } catch (err) {
      showApiError(err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await removeCategory(pendingDelete.id).unwrap();
      showSuccess("Category deleted");
      setPendingDelete(null);
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <>
      <Modal open={open} onClose={handleClose} title="Expense Categories">
        <div className="space-y-5">
          <form onSubmit={handleCreate} className="flex items-end gap-2">
            <div className="flex-1">
              <FormField label="New category">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Utilities, Rent, Marketing"
                />
              </FormField>
            </div>
            <Button type="submit" loading={creating} icon={<Plus className="h-4 w-4" />}>
              Add
            </Button>
          </form>

          <div className="border-t pt-4">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              {categories.length} categor
              {categories.length === 1 ? "y" : "ies"}
            </p>
            {categories.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
                No categories yet
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[280px] overflow-y-auto">
                {categories.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingDelete(c)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-danger-500" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" type="button" onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete category?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed. Existing expenses in this category will lose their label.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        loading={removing}
      />
    </>
  );
}
