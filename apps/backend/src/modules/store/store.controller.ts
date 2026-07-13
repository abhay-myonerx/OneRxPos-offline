// Express handlers for store management

import { Request, Response, NextFunction } from "express";
import * as storeService from "./store.service";
import { paginationSchema } from "../../shared/utils/pagination";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters = {
      search: req.query.search as string | undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };

    const result = await storeService.listStores(req.db!, filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const store = await storeService.getStoreById(req.db!, req.params.id as string);
    res.json({ success: true, data: store });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const store = await storeService.createStore(req.db!, req.user!.tenantId, req.body);
    res.status(201).json({ success: true, data: store });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const store = await storeService.updateStore(req.db!, req.params.id as string, req.body);
    res.json({ success: true, data: store });
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const store = await storeService.updateStoreSettings(
      req.db!,
      req.params.id as string,
      req.body,
    );
    res.json({ success: true, data: store });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const store = await storeService.deleteStore(req.db!, req.params.id as string);
    res.json({ success: true, data: store });
  } catch (error) {
    next(error);
  }
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await storeService.getStoreStats(req.db!, req.params.id as string);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

// ── Phase 21a — Geolocation + IP whitelist (OI-030) ─────────────────────────

export async function updateGeolocation(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await storeService.updateGeolocation(
      req.db!,
      req.user!,
      req.params.id as string,
      req.body,
    );
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
}

export async function updateIpWhitelist(req: Request, res: Response, next: NextFunction) {
  try {
    const row = await storeService.updateIpWhitelist(
      req.db!,
      req.user!,
      req.params.id as string,
      req.body,
    );
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
}
