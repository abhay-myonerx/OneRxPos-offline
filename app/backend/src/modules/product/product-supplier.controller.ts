// HTTP layer for product↔vendor management (3H.2).

import { Request, Response, NextFunction } from "express";
import * as svc from "./product-supplier.service";
import type { AddVendorBody } from "./product-supplier.validation";

export async function listVendors(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.listVendors(req.db!, req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addVendor(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await svc.addVendor(req.db!, req.params.id as string, req.body as AddVendorBody);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function updateVendor(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await svc.updateVendor(
      req.db!,
      req.params.id as string,
      req.params.supplierId as string,
      req.body as Partial<AddVendorBody>,
    );
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

export async function removeVendor(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.removeVendor(req.db!, req.params.id as string, req.params.supplierId as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function prefer(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.setPreferred(req.db!, req.params.id as string, req.params.supplierId as string);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
