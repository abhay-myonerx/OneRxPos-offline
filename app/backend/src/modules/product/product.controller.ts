// handlers for product management

import { Request, Response, NextFunction } from "express";
import * as productService from "./product.service";
import { paginationSchema } from "../../shared/utils/pagination";
import { ensureMiscProduct } from "./misc-product.service";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters = {
      search: req.query.search as string | undefined,
      categoryId: req.query.categoryId as string | undefined,
      productType: req.query.productType as string | undefined,
      storeId: req.query.storeId as string | undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
      storeIds: !req.query.storeId ? req.user?.storeIds : undefined,
    };

    const result = await productService.listProducts(req.db!, filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.getProductById(req.db!, req.params.id as string);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

// ── Misc / open-price item (Phase 1.3a Task 9) ──────────────────────────────

export async function misc(req: Request, res: Response, next: NextFunction) {
  try {
    const id = await ensureMiscProduct(req.db!, req.user!.tenantId);
    res.json({ success: true, data: { id } });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.createProduct(req.db!, req.user!.tenantId, req.body);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.updateProduct(req.db!, req.params.id as string, req.body);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productService.deleteProduct(req.db!, req.params.id as string);
    res.json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

// ── Barcode Lookup ──────────────────────────────────────────────────────────

export async function lookupByBarcode(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productService.lookupByBarcode(req.db!, req.params.barcode as string);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Variants ────────────────────────────────────────────────────────────────

export async function addVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await productService.addVariant(req.db!, req.params.id as string, req.body);
    res.status(201).json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
}

export async function updateVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await productService.updateVariant(
      req.db!,
      req.params.id as string,
      req.params.variantId as string,
      req.body,
    );
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
}

export async function deleteVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productService.deleteVariant(
      req.db!,
      req.params.id as string,
      req.params.variantId as string,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Bulk ─────────────────────────────────────────────────────────────────────

export async function bulkImport(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await productService.bulkImport(req.user!.tenantId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
