import { Request, Response, NextFunction } from "express";
import * as service from "./super-admin.service";
import { paginationSchema } from "../../shared/utils/pagination";

// ── List all SUPER_ADMINs ────────────────────────────────────────────────────

export async function listSuperAdmins(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const result = await service.listSuperAdmins(pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

// ── Create SUPER_ADMIN ───────────────────────────────────────────────────────

export async function createSuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.createSuperAdmin(req.body, req.user!.id);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Platform stats ───────────────────────────────────────────────────────────

export async function getPlatformStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await service.getPlatformStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
}

// ── List all users cross-tenant ──────────────────────────────────────────────

export async function listAllUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters = {
      search: req.query.search as string | undefined,
      role: req.query.role as string | undefined,
      tenantId: req.query.tenantId as string | undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };
    const result = await service.listAllUsers(filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

// ── Get any user cross-tenant ────────────────────────────────────────────────

export async function getUserCrossTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await service.getUserCrossTenant(req.params.userId as string);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

// ── Soft delete (deactivate) any user ────────────────────────────────────────

export async function softDeleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.softDeleteUser(req.params.userId as string, req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Restore (re-activate) a user ─────────────────────────────────────────────

export async function restoreUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.restoreUser(req.params.userId as string, req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Hard delete any user (permanent) ─────────────────────────────────────────

export async function hardDeleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.hardDeleteUser(
      req.params.userId as string,
      req.user!.id,
      req.body,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Bulk user action ──────────────────────────────────────────────────────────

export async function bulkUserAction(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.bulkUserAction(req.body, req.user!.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Reset any user password ───────────────────────────────────────────────────

export async function resetAnyUserPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.resetAnyUserPassword(
      req.params.userId as string,
      req.body.newPassword,
      req.user!.id,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
