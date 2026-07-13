// Express handlers for tenant management

import { Request, Response, NextFunction } from "express";
import * as tenantService from "./tenant.service";
import { paginationSchema } from "../../shared/utils/pagination";

// ── Own tenant (ADMIN) ─────────────────────────────────────────────────────

export async function getMyTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.getMyTenant(req.user!.tenantId);
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

export async function updateMyTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.updateTenant(req.user!.tenantId, req.body);
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await tenantService.getSettings(req.user!.tenantId);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.updateSettings(req.user!.tenantId, req.body);
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await tenantService.getDashboardStats(req.user!.tenantId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

// Manager dashboard — accessible to MANAGER role via report:read permission
export async function getManagerDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await tenantService.getManagerDashboardStats(req.user!.tenantId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

// ── SUPER_ADMIN ─────────────────────────────────────────────────────────────

export async function listTenants(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters = {
      status: req.query.status as string | undefined,
      plan: req.query.plan as string | undefined,
      search: req.query.search as string | undefined,
    };
    const result = await tenantService.listTenants(filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getTenantById(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.getTenantById(req.params.id as string);
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

export async function changePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.changePlan(req.params.id as string, req.body);
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}

export async function changeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await tenantService.changeStatus(req.params.id as string, req.body);
    res.json({ success: true, data: tenant });
  } catch (error) {
    next(error);
  }
}
