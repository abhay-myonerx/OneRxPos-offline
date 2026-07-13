export interface Expense {
  id: string;
  tenantId: string;
  storeId?: string | null;
  categoryId: string;
  amount: string; //amount: z.number() in backend, but string here will be a issue in future?
  description: string;
  date: string; //date: z.coerce.date() in backend, but string here will be a issue in future?
  receiptUrl?: string | null;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
  category?: ExpenseCategory;
  store?: { id: string; name: string } | null;
  recorder?: { id: string; firstName: string; lastName: string };
}

export interface ExpenseCategory {
  id: string;
  tenantId: string;
  name: string;
  createdAt: string;
}

export interface CreateExpenseInput {
  storeId?: string;
  categoryId: string;
  amount: number;
  description: string;
  date: string;
  receiptUrl?: string;
}
export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface ExpenseSummary {
  totalAmount: string;
  count: number;
  byCategory: { categoryId: string; categoryName: string; total: string; count: number }[];
}
