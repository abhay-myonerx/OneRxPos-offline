import { Request, Response, NextFunction } from "express";
import * as auditService from "./audit.service";
import { paginationSchema } from "../../shared/utils/pagination";

// ── Tenant-scoped (ADMIN) ────────────────────────────────────────────────────

export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters: auditService.AuditLogFilters = {
      userId: req.query.userId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const result = await auditService.listAuditLogs(req.db!, filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

// ── Platform-wide (SUPER_ADMIN) ──────────────────────────────────────────────

export async function listAllAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);
    const filters: auditService.AuditLogFilters = {
      userId: req.query.userId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const tenantId = req.query.tenantId as string | undefined;
    const result = await auditService.listAllAuditLogs(tenantId, filters, pagination);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
