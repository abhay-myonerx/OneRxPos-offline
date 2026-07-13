import { Request, Response, NextFunction } from "express";
import * as inventoryService from "./inventory.service";
import * as movementService from "./stockMovement.service";
import * as transferService from "./transfer.service";
import { paginationSchema } from "../../shared/utils/pagination";
import {
  adjustStockSchema,
  setStockSchema,
  updateThresholdSchema,
  createTransferSchema,
  receiveTransferSchema,
  listMovementsSchema,
  listTransfersSchema,
  lowStockQuerySchema,
} from "./inventory.validation";

// -- Stock levels -----------------------------------------------------------

export async function listStock(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = paginationSchema.parse(req.query);
    const pagination = {
      ...parsed,
      sortBy: (req.query.sortBy as string) || "updatedAt",
    };

    const result = await inventoryService.listStockLevels(
      req.db!,
      {
        storeId: req.query.storeId as string | undefined,
        productId: req.query.productId as string | undefined,
        search: req.query.search as string | undefined,
        belowThreshold: req.query.belowThreshold === "true",
      },
      pagination,
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getLowStock(req: Request, res: Response, next: NextFunction) {
  try {
    const query = lowStockQuerySchema.parse(req.query);
    const result = await inventoryService.getLowStockItems(req.db!, query);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function adjustStock(req: Request, res: Response, next: NextFunction) {
  try {
    const input = adjustStockSchema.parse(req.body);
    const result = await inventoryService.adjustStock(req.db!, req.tenantId!, req.user!.id, input);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function setStock(req: Request, res: Response, next: NextFunction) {
  try {
    const input = setStockSchema.parse(req.body);
    const result = await inventoryService.setStock(req.db!, req.tenantId!, req.user!.id, input);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateThreshold(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId, productId } = req.params;
    const variantId = req.query.variantId as string | undefined;
    const input = updateThresholdSchema.parse(req.body);
    const result = await inventoryService.updateThreshold(
      req.db!,
      storeId as string,
      productId as string,
      variantId,
      input,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// -- Stock movements --------------------------------------------------------

export async function listMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = listMovementsSchema.parse(req.query);
    const result = await movementService.listStockMovements(req.db!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// -- Transfers --------------------------------------------------------------

export async function listTransfers(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters = listTransfersSchema.parse(req.query);
    const result = await transferService.listTransfers(
      req.db!,
      req.tenantId!,
      req.user!,
      filters,
      pagination,
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const transfer = await transferService.getTransferById(
      req.db!,
      req.tenantId!,
      req.params.id as string,
      req.user!,
    );
    res.json({ success: true, data: transfer });
  } catch (err) {
    next(err);
  }
}

export async function createTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createTransferSchema.parse(req.body);
    const result = await transferService.createTransfer(req.db!, req.tenantId!, req.user!, input);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function shipTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await transferService.shipTransfer(
      req.db!,
      req.tenantId!,
      req.user!,
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function receiveTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const input = receiveTransferSchema.parse(req.body);
    const result = await transferService.receiveTransfer(
      req.db!,
      req.tenantId!,
      req.user!,
      req.params.id as string,
      input,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function cancelTransfer(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await transferService.cancelTransfer(
      req.db!,
      req.tenantId!,
      req.user!,
      req.params.id as string,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
