"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form/form-field";
import { Loading } from "@/components/shared/feedback/Loading";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { todayISO } from "@/lib/date/format-date";
import {
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useGetExpenseQuery,
} from "../api/expenses.api";
import type { CreateExpenseInput, ExpenseCategory } from "../types/expense.types";

interface Props {
  open: boolean;
  onClose: () => void;
  editingId: string | null;
  categories: ExpenseCategory[];
}

const emptyForm: CreateExpenseInput = {
  categoryId: "",
  amount: 0,
  description: "",
  date: todayISO(),
  receiptUrl: "",
};

export function ExpenseFormModal({ open, onClose, editingId, categories }: Props) {
  const { data: editing, isFetching } = useGetExpenseQuery(editingId ?? "", {
    skip: !editingId,
  });
  const [create, { isLoading: creating }] = useCreateExpenseMutation();
  const [update, { isLoading: updating }] = useUpdateExpenseMutation();

  const [form, setForm] = useState<CreateExpenseInput>(() =>
    editingId && editing
      ? {
          categoryId: editing.categoryId,
          amount: parseFloat(editing.amount),
          description: editing.description,
          date: editing.date.slice(0, 10),
          receiptUrl: editing.receiptUrl ?? "",
        }
      : emptyForm,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId || !form.description.trim() || form.amount <= 0) {
      showApiError({
        data: {
          error: {
            message: "Category, amount and description are required",
          },
        },
      });
      return;
    }
    try {
      const payload = {
        ...form,
        receiptUrl: form.receiptUrl?.trim() || undefined,
      };
      if (editingId) {
        await update({ id: editingId, data: payload }).unwrap();
        showSuccess("Expense updated");
      } else {
        await create(payload).unwrap();
        showSuccess("Expense recorded");
      }
      onClose();
    } catch (err) {
      showApiError(err);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editingId ? "Edit Expense" : "Record Expense"}>
      {editingId && isFetching ? (
        <Loading />
      ) : (
        <form key={editingId ?? "new"} onSubmit={submit} className="space-y-4">
          <FormField label="Category" required>
            <Select
              placeholder="Select category"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              options={categories.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Amount" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </FormField>
            <FormField label="Date" required>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Description" required>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was this expense for?"
            />
          </FormField>

          <FormField label="Receipt URL (optional)">
            <Input
              type="url"
              placeholder="https://…"
              value={form.receiptUrl ?? ""}
              onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })}
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={editingId ? updating : creating}>
              {editingId ? "Save Changes" : "Record Expense"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
