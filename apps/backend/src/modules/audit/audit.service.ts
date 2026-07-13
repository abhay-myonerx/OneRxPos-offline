// Read-only access to audit logs — ADMIN sees own tenant, SUPER_ADMIN sees all.

import { prisma, TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: string; // ISO date
  to?: string; // ISO date
}

// ── Tenant-scoped audit log (ADMIN/MANAGER) ──────────────────────────────────

export async function listAuditLogs(
  db: TenantPrismaClient,
  filters: AuditLogFilters,
  pagination: PaginationParams,
) {
  const where = buildWhere(filters);

  const [data, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      // orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        oldData: true,
        newData: true,
        ipAddress: true,
        createdAt: true,
      },
      ...buildPagination(pagination),
    }),
    db.auditLog.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// ── Platform-wide audit log (SUPER_ADMIN only) ───────────────────────────────

export async function listAllAuditLogs(
  tenantId: string | undefined,
  filters: AuditLogFilters,
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = buildWhere(filters);
  if (tenantId) where.tenantId = tenantId;

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      // orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        action: true,
        entityType: true,
        entityId: true,
        oldData: true,
        newData: true,
        ipAddress: true,
        createdAt: true,
      },
      ...buildPagination(pagination),
    }),
    prisma.auditLog.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// ── Helper to write an audit log entry ──────────────────────────────────────
// Call this from any service that mutates important data.

export async function writeAuditLog(params: {
  tenantId: string;
  userId?: string;
  action: string; // e.g. "USER_CREATED", "SALE_VOIDED"
  entityType: string; // e.g. "User", "Sale"
  entityId: string;
  oldData?: unknown;
  newData?: unknown;
  ipAddress?: string;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      oldData: params.oldData ? (params.oldData as object) : undefined,
      newData: params.newData ? (params.newData as object) : undefined,
      ipAddress: params.ipAddress,
    },
  });
}

// ── Private filter builder ───────────────────────────────────────────────────

function buildWhere(filters: AuditLogFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.userId) where.userId = filters.userId;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.action) where.action = ciContains(filters.action);

  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }

  return where;
}
