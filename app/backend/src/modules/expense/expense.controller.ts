import { Request, Response, NextFunction } from "express";
import * as expenseService from "./expense.service";
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesSchema,
  createExpenseCategorySchema,
} from "./expense.validation";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listExpensesSchema.parse(req.query);
    const result = await expenseService.listExpenses(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const expense = await expenseService.getExpenseById(req.db!, req.params.id as string);
    res.json({ success: true, data: expense });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createExpenseSchema.parse(req.body);
    const expense = await expenseService.createExpense(req.db!, req.tenantId!, req.user!.id, input);
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateExpenseSchema.parse(req.body);
    const expense = await expenseService.updateExpense(req.db!, req.params.id as string, input);
    res.json({ success: true, data: expense });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await expenseService.deleteExpense(req.db!, req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : startOfMonth();
    const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : new Date();
    const storeId = req.query.storeId as string | undefined;
    const result = await expenseService.getExpenseSummary(req.db!, dateFrom, dateTo, storeId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Expense categories ───────────────────────────────────────────────────────

export async function listCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await expenseService.listCategories(req.db!);
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createExpenseCategorySchema.parse(req.body);
    const cat = await expenseService.createCategory(req.db!, req.tenantId!, input);
    res.status(201).json({ success: true, data: cat });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await expenseService.deleteCategory(req.db!, req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Utility ──────────────────────────────────────────────────────────────────

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
