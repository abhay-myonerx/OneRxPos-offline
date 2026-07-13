import { Request, Response, NextFunction } from "express";
import * as supplierService from "./supplier.service";
import {
  createSupplierSchema,
  updateSupplierSchema,
  listSuppliersSchema,
} from "./supplier.validation";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listSuppliersSchema.parse(req.query);
    const result = await supplierService.listSuppliers(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await supplierService.getSupplierById(req.db!, req.params.id as string);
    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createSupplierSchema.parse(req.body);
    const supplier = await supplierService.createSupplier(req.db!, req.tenantId!, input);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const input = updateSupplierSchema.parse(req.body);
    const supplier = await supplierService.updateSupplier(req.db!, req.params.id as string, input);
    res.json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await supplierService.deleteSupplier(req.db!, req.params.id as string);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
