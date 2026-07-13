import { z } from "zod";

// ── Create expense ──────────────────────────────────────────────────────────
export const createExpenseSchema = z.object({
  storeId: z.string().uuid("Invalid store UUID").optional().nullable(),
  categoryId: z.string().uuid("Invalid category UUID"),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required").max(1000),
  date: z.coerce.date(),
  receiptUrl: z.string().url("Must be a valid URL").optional().nullable(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// ── Update expense ──────────────────────────────────────────────────────────
export const updateExpenseSchema = z.object({
  storeId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional(),
  amount: z.number().positive().optional(),
  description: z.string().min(1).max(1000).optional(),
  date: z.coerce.date().optional(),
  receiptUrl: z.string().url().optional().nullable(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// ── List expenses query ─────────────────────────────────────────────────────
export const listExpensesSchema = z.object({
  storeId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "date", "amount"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListExpensesInput = z.infer<typeof listExpensesSchema>;

// ── Expense categories ──────────────────────────────────────────────────────
export const createExpenseCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100),
});

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
