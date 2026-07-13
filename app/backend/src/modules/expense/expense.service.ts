import { TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { logger } from "../../shared/utils/logger";
import { ciEquals } from "../../shared/utils/ci-match";
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ListExpensesInput,
  CreateExpenseCategoryInput,
} from "./expense.validation";

// ── List expenses ───────────────────────────────────────────────────────────────

export async function listExpenses(db: TenantPrismaClient, filters: ListExpensesInput) {
  const where: Record<string, unknown> = {};

  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.categoryId) where.categoryId = filters.categoryId;

  if (filters.dateFrom || filters.dateTo) {
    where.date = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lte: filters.dateTo }),
    };
  }

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    db.expense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        store: { select: { id: true, name: true, code: true } },
        recorder: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip,
      take: filters.limit,
    }),
    db.expense.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasMore: filters.page * filters.limit < total,
    },
  };
}

// ── Get expense by ID ───────────────────────────────────────────────────────────

export async function getExpenseById(db: TenantPrismaClient, expenseId: string) {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    include: {
      category: true,
      store: { select: { id: true, name: true } },
      recorder: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!expense) throw new NotFoundError("Expense", expenseId);
  return expense;
}

// ── Create expense ──────────────────────────────────────────────────────────────

export async function createExpense(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: CreateExpenseInput,
) {
  // Validate category
  const category = await db.expenseCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new NotFoundError("Expense category", input.categoryId);

  // Validate store if provided
  if (input.storeId) {
    const store = await db.store.findUnique({ where: { id: input.storeId } });
    if (!store) throw new NotFoundError("Store", input.storeId);
  }

  const expense = await db.expense.create({
    data: {
      tenantId,
      storeId: input.storeId ?? null,
      categoryId: input.categoryId,
      amount: input.amount,
      description: input.description,
      date: input.date,
      receiptUrl: input.receiptUrl ?? null,
      recordedBy: userId,
    },
    include: {
      category: { select: { id: true, name: true } },
      store: { select: { id: true, name: true } },
    },
  });

  logger.info({ tenantId, expenseId: expense.id, amount: input.amount }, "Expense recorded");
  return expense;
}

// ── Update expense ──────────────────────────────────────────────────────────────

export async function updateExpense(
  db: TenantPrismaClient,
  expenseId: string,
  input: UpdateExpenseInput,
) {
  const expense = await db.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new NotFoundError("Expense", expenseId);

  if (input.categoryId) {
    const cat = await db.expenseCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw new NotFoundError("Expense category", input.categoryId);
  }

  const updated = await db.expense.update({
    where: { id: expenseId },
    data: input,
    include: {
      category: { select: { id: true, name: true } },
      store: { select: { id: true, name: true } },
    },
  });

  logger.info({ expenseId }, "Expense updated");
  return updated;
}

// ── Delete expense ──────────────────────────────────────────────────────────────

export async function deleteExpense(db: TenantPrismaClient, expenseId: string) {
  const expense = await db.expense.findUnique({ where: { id: expenseId } });
  if (!expense) throw new NotFoundError("Expense", expenseId);

  await db.expense.delete({ where: { id: expenseId } });
  logger.info({ expenseId }, "Expense deleted");
  return { success: true };
}

// ── Expense summary (for dashboard) ─────────────────────────────────────────────

export async function getExpenseSummary(
  db: TenantPrismaClient,
  dateFrom: Date,
  dateTo: Date,
  storeId?: string,
) {
  const where: Record<string, unknown> = {
    date: { gte: dateFrom, lte: dateTo },
  };
  if (storeId) where.storeId = storeId;

  const [total, byCategory] = await Promise.all([
    db.expense.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    }),
    db.expense.groupBy({
      by: ["categoryId"],
      where,
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: "desc" } },
    }),
  ]);

  // Enrich with category names
  const categoryIds = byCategory.map((b) => b.categoryId);
  const categories = await db.expenseCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  return {
    totalAmount: total._sum.amount?.toString() ?? "0",
    totalCount: total._count,
    byCategory: byCategory.map((b) => ({
      categoryId: b.categoryId,
      categoryName: catMap.get(b.categoryId) ?? "Unknown",
      amount: b._sum.amount?.toString() ?? "0",
      count: b._count,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

export async function listCategories(db: TenantPrismaClient) {
  return db.expenseCategory.findMany({
    include: { _count: { select: { expenses: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createCategory(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateExpenseCategoryInput,
) {
  const existing = await db.expenseCategory.findFirst({
    where: { name: ciEquals(input.name) },
  });
  if (existing) throw new ConflictError(`Expense category "${input.name}" already exists`);

  return db.expenseCategory.create({
    data: { tenantId, name: input.name },
  });
}

export async function deleteCategory(db: TenantPrismaClient, categoryId: string) {
  const cat = await db.expenseCategory.findUnique({
    where: { id: categoryId },
    include: { _count: { select: { expenses: true } } },
  });
  if (!cat) throw new NotFoundError("Expense category", categoryId);
  if (cat._count.expenses > 0) {
    throw new ConflictError(`Cannot delete — ${cat._count.expenses} expense(s) use this category`);
  }

  await db.expenseCategory.delete({ where: { id: categoryId } });
  return { success: true };
}
