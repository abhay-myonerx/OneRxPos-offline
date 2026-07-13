import { baseApi } from "@/store/base-api";
import type { ApiResponse, PaginatedResponse } from "@/types/common/api-response.types";
import type {
  Expense,
  ExpenseCategory,
  CreateExpenseInput,
  ExpenseSummary,
} from "../types/expense.types";

export const expensesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listExpenses: build.query<
      { data: Expense[]; pagination: PaginatedResponse<Expense>["pagination"] },
      {
        storeId?: string;
        categoryId?: string;
        dateFrom?: string;
        dateTo?: string;
        page?: number;
        limit?: number;
      }
    >({
      query: (params) => ({ url: "/expenses", params }),
      transformResponse: (res: PaginatedResponse<Expense>) => ({
        data: res.data,
        pagination: res.pagination,
      }),
      providesTags: ["Expense"],
    }),
    getExpense: build.query<Expense, string>({
      query: (id) => `/expenses/${id}`,
      transformResponse: (res: ApiResponse<Expense>) => res.data,
    }),
    createExpense: build.mutation<Expense, CreateExpenseInput>({
      query: (body) => ({ url: "/expenses", method: "POST", body }),
      transformResponse: (res: ApiResponse<Expense>) => res.data,
      invalidatesTags: ["Expense"],
    }),
    updateExpense: build.mutation<Expense, { id: string; data: Partial<CreateExpenseInput> }>({
      query: ({ id, data }) => ({ url: `/expenses/${id}`, method: "PATCH", body: data }),
      transformResponse: (res: ApiResponse<Expense>) => res.data,
      invalidatesTags: ["Expense"],
    }),
    deleteExpense: build.mutation<void, string>({
      query: (id) => ({ url: `/expenses/${id}`, method: "DELETE" }),
      invalidatesTags: ["Expense"],
    }),
    listExpenseCategories: build.query<ExpenseCategory[], void>({
      query: () => "/expenses/categories",
      transformResponse: (res: ApiResponse<ExpenseCategory[]>) => res.data,
      providesTags: ["Expense"],
    }),
    createExpenseCategory: build.mutation<ExpenseCategory, { name: string }>({
      query: (body) => ({ url: "/expenses/categories", method: "POST", body }),
      transformResponse: (res: ApiResponse<ExpenseCategory>) => res.data,
      invalidatesTags: ["Expense"],
    }),
    deleteExpenseCategory: build.mutation<void, string>({
      query: (id) => ({ url: `/expenses/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["Expense"],
    }),
    getExpenseSummary: build.query<
      ExpenseSummary,
      { storeId?: string; dateFrom?: string; dateTo?: string }
    >({
      query: (params) => ({ url: "/expenses/summary", params }),
      transformResponse: (res: ApiResponse<ExpenseSummary>) => res.data,
    }),
  }),
});

export const {
  useListExpensesQuery,
  useGetExpenseQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  useListExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
  useGetExpenseSummaryQuery,
} = expensesApi;
