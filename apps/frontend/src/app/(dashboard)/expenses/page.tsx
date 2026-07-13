"use client";

/**
 * Expenses tracker: KPI summary strip, date-range filter, per-category chart,
 * and paginated expense table. Category management opens in a side modal.
 * The description search (`q`) is applied client-side because the list API
 * doesn't expose a free-text param — filtering is fast for 20-row pages.
 * The summary query uses the same date range as the list so KPIs always match
 * the visible rows, even when the user narrows the window.
 */
import { useMemo, useState } from "react";
import { Plus, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/container";
import { Loading } from "@/components/shared/feedback/Loading";
import { ErrorDisplay } from "@/components/shared/feedback/Error";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { showApiError, showSuccess } from "@/lib/api/error-handler";
import { todayISO, thirtyDaysAgoISO, formatDate } from "@/lib/date/format-date";
import {
  useListExpensesQuery,
  useDeleteExpenseMutation,
  useListExpenseCategoriesQuery,
  useGetExpenseSummaryQuery,
} from "@/features/expenses/api/expenses.api";
import type { Expense } from "@/features/expenses/types/expense.types";
import { ExpenseKpis } from "@/features/expenses/components/ExpenseKpis";
import {
  ExpenseFilters,
  type ExpenseFilterState,
} from "@/features/expenses/components/ExpenseFilters";
import { ExpenseChart } from "@/features/expenses/components/ExpenseChart";
import { ExpenseTable } from "@/features/expenses/components/ExpenseTable";
import { ExpenseFormModal } from "@/features/expenses/components/ExpenseFormModal";
import { ExpenseCategoriesModal } from "@/features/expenses/components/ExpenseCategoriesModal";

const initialFilters: ExpenseFilterState = {
  q: "",
  categoryId: "",
  dateFrom: thirtyDaysAgoISO(),
  dateTo: todayISO(),
};

export default function ExpensesPage() {
  const [filters, setFilters] = useState<ExpenseFilterState>(initialFilters);
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useListExpensesQuery({
    page,
    limit: 20,
    categoryId: filters.categoryId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });
  const { data: categories } = useListExpenseCategoriesQuery();
  const { data: summary } = useGetExpenseSummaryQuery({
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });

  const [remove, { isLoading: deleting }] = useDeleteExpenseMutation();

  // Client-side description search — memoized to avoid re-filtering on
  // every unrelated state change (e.g. modal open/close).
  const filteredExpenses = useMemo(() => {
    const all = data?.data ?? [];
    const q = filters.q.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) => e.description.toLowerCase().includes(q));
  }, [data?.data, filters.q]);

  const rangeLabel = `${formatDate(filters.dateFrom)} – ${formatDate(filters.dateTo)}`;

  const openCreate = () => {
    setEditingId(null);
    setFormOpen(true);
  };
  const openEdit = (id: string) => {
    setEditingId(id);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await remove(pendingDelete.id).unwrap();
      showSuccess("Expense deleted");
      setPendingDelete(null);
    } catch (err) {
      showApiError(err);
    }
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  if (isLoading) return <Loading />;
  if (isError) return <ErrorDisplay message="Failed to load expenses." onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Track and analyse business spending across categories"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCatOpen(true)}
              icon={<Tag className="h-4 w-4" />}
            >
              Categories
            </Button>
            <Button onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
              Add Expense
            </Button>
          </div>
        }
      />

      <ExpenseKpis summary={summary} rangeLabel={rangeLabel} />

      <ExpenseFilters
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        onReset={resetFilters}
        categories={categories ?? []}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Dim the table during background refetches while keeping it interactive. */}
        <div className={`xl:col-span-2 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
          <ExpenseTable
            expenses={filteredExpenses}
            onEdit={openEdit}
            onDelete={(ex) => setPendingDelete(ex)}
          />
        </div>
        <div className="xl:col-span-1">
          <ExpenseChart summary={summary} />
        </div>
      </div>

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 mb-6">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {page} of {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.pagination.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Modals */}
      <ExpenseFormModal
        open={formOpen}
        onClose={closeForm}
        editingId={editingId}
        categories={categories ?? []}
      />

      <ExpenseCategoriesModal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        categories={categories ?? []}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this expense?"
        description={
          pendingDelete
            ? `"${pendingDelete.description}" will be permanently removed. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
