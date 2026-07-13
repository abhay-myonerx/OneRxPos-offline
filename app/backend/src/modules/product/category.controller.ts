// Express handlers for category management

import { Request, Response, NextFunction } from "express";
import * as categoryService from "./category.service";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = {
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
      flat: req.query.flat === "true",
    };

    const categories = await categoryService.listCategories(req.db!, filters);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.getCategoryById(req.db!, req.params.id as string);
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.createCategory(req.db!, req.user!.tenantId, req.body);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.updateCategory(
      req.db!,
      req.params.id as string,
      req.body,
    );
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoryService.deleteCategory(req.db!, req.params.id as string);
    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
}
