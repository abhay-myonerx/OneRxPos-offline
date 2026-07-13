// Store business logic — CRUD, settings, per-store stats

import { TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ConflictError } from "../../shared/errors/ConflictError";
import { logger } from "../../shared/utils/logger";
import {
  buildPagination,
  formatPaginatedResponse,
  PaginationParams,
} from "../../shared/utils/pagination";
import type {
  CreateStoreInput,
  UpdateStoreInput,
  UpdateStoreSettingsInput,
} from "./store.validation";

// ── List stores ─────────────────────────────────────────────────────────────

export async function listStores(
  db: TenantPrismaClient,
  filters: { search?: string; isActive?: boolean },
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search) {
    where.OR = [
      { name: ciContains(filters.search) },
      { code: ciContains(filters.search) },
    ];
  }

  const [data, total] = await Promise.all([
    db.store.findMany({
      where,
      include: {
        _count: { select: { users: true, sales: true } },
      },
      ...buildPagination(pagination),
    }),
    db.store.count({ where }),
  ]);

  return formatPaginatedResponse(data, total, pagination);
}

// ── Get store by ID ─────────────────────────────────────────────────────────

export async function getStoreById(db: TenantPrismaClient, storeId: string) {
  const store = await db.store.findUnique({
    where: { id: storeId },
    include: {
      users: {
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true, email: true },
      },
      _count: {
        select: { sales: true, storeStock: true, purchases: true, expenses: true },
      },
    },
  });

  if (!store) throw new NotFoundError("Store", storeId);
  return store;
}

// ── Create store ────────────────────────────────────────────────────────────

export async function createStore(
  db: TenantPrismaClient,
  tenantId: string,
  input: CreateStoreInput,
) {
  // Code uniqueness is enforced by @@unique([tenantId, code]) but we give
  // a friendlier error than a raw P2002
  const existing = await db.store.findFirst({
    where: { code: input.code },
  });

  if (existing) {
    throw new ConflictError(`A store with code "${input.code}" already exists`);
  }

  const store = await db.store.create({
    data: {
      tenantId,
      name: input.name,
      code: input.code,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      province: input.province ?? null,
      settings: (input.settings ?? {}) as any,
    },
  });

  logger.info({ tenantId, storeId: store.id, code: store.code }, "Store created");
  return store;
}

// ── Update store ────────────────────────────────────────────────────────────

export async function updateStore(
  db: TenantPrismaClient,
  storeId: string,
  input: UpdateStoreInput,
) {
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError("Store", storeId);

  // If code is being changed, check for conflicts
  if (input.code && input.code !== store.code) {
    const conflict = await db.store.findFirst({
      where: { code: input.code, id: { not: storeId } },
    });
    if (conflict) {
      throw new ConflictError(`A store with code "${input.code}" already exists`);
    }
  }

  const updated = await db.store.update({
    where: { id: storeId },
    data: input,
  });

  logger.info({ storeId }, "Store updated");
  return updated;
}

// ── Update store settings (JSON merge) ──────────────────────────────────────

export async function updateStoreSettings(
  db: TenantPrismaClient,
  storeId: string,
  input: UpdateStoreSettingsInput,
) {
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError("Store", storeId);

  const currentSettings = (store.settings as Record<string, unknown>) ?? {};
  const mergedSettings = { ...currentSettings, ...input };

  const updated = await db.store.update({
    where: { id: storeId },
    data: { settings: mergedSettings as any },
  });

  logger.info({ storeId, keys: Object.keys(input) }, "Store settings updated");
  return updated;
}

// ── Delete store (soft — deactivate) ────────────────────────────────────────

export async function deleteStore(db: TenantPrismaClient, storeId: string) {
  const store = await db.store.findUnique({
    where: { id: storeId },
    include: { _count: { select: { users: true } } },
  });

  if (!store) throw new NotFoundError("Store", storeId);

  // Prevent deactivation if active users are still assigned
  if (store._count.users > 0) {
    throw new ConflictError(
      `Cannot deactivate store — ${store._count.users} user(s) still assigned. Reassign them first.`,
    );
  }

  const updated = await db.store.update({
    where: { id: storeId },
    data: { isActive: false },
  });

  logger.info({ storeId }, "Store deactivated");
  return updated;
}

// ── Per-store stats ─────────────────────────────────────────────────────────

export async function getStoreStats(db: TenantPrismaClient, storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError("Store", storeId);

  const today = startOfToday();

  const [userCount, productCount, todaySales, todayRevenue, lowStockCount] = await Promise.all([
    db.user.count({ where: { storeId, isActive: true } }),
    db.storeStock.count({ where: { storeId, quantity: { gt: 0 } } }),
    db.sale.count({
      where: { storeId, status: "COMPLETED", createdAt: { gte: today } },
    }),
    db.sale.aggregate({
      where: {
        storeId,
        status: { in: ["COMPLETED", "PARTIAL"] },
        createdAt: { gte: today },
      },
      _sum: { grandTotal: true },
    }),
    // Raw count is cleaner here — Prisma can't reference another column in where
    db.storeStock.count({
      where: { storeId, quantity: { gt: 0, lt: 10 } },
    }),
  ]);

  return {
    users: userCount,
    productsInStock: productCount,
    todaySales,
    todayRevenue: todayRevenue._sum.grandTotal?.toString() ?? "0",
    lowStockItems: lowStockCount,
    inventoryMetricsNote:
      "productsInStock and lowStockItems count store_stock rows with quantity in range (variable products: one row per variant per store). Checkout uses the same variant-level rows.",
  };
}

// ── Phase 21a — Geolocation + IP whitelist (OI-030) ─────────────────────────

import { recordAudit } from "../../shared/utils/auditLog";
import { clearModuleCache } from "../../middleware/moduleEnabled";

interface ActorLike {
  id: string;
  tenantId: string;
}

export async function updateGeolocation(
  db: TenantPrismaClient,
  actor: ActorLike,
  storeId: string,
  input: {
    geoLat?: number | null;
    geoLng?: number | null;
    geoRadiusM?: number | null;
  },
) {
  const existing = await db.store.findUnique({ where: { id: storeId } });
  if (!existing) throw new NotFoundError("Store", storeId);

  const row = await db.store.update({
    where: { id: storeId },
    data: {
      geoLat: input.geoLat ?? null,
      geoLng: input.geoLng ?? null,
      geoRadiusM: input.geoRadiusM ?? null,
    },
  });

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "STORE_UPDATED",
    entityType: "Store",
    entityId: storeId,
    oldData: {
      geoLat: existing.geoLat,
      geoLng: existing.geoLng,
      geoRadiusM: existing.geoRadiusM,
    },
    newData: {
      geoLat: row.geoLat,
      geoLng: row.geoLng,
      geoRadiusM: row.geoRadiusM,
    },
  });

  return row;
}

export async function updateIpWhitelist(
  db: TenantPrismaClient,
  actor: ActorLike,
  storeId: string,
  input: { ipWhitelist: string[]; attendanceMethods?: string[] },
) {
  const existing = await db.store.findUnique({ where: { id: storeId } });
  if (!existing) throw new NotFoundError("Store", storeId);

  const row = await db.store.update({
    where: { id: storeId },
    data: {
      ipWhitelist: input.ipWhitelist,
      ...(input.attendanceMethods !== undefined
        ? { attendanceMethods: input.attendanceMethods }
        : {}),
    },
  });

  // Bust the moduleEnabled cache since attendance method config
  // doesn't actually live in Tenant.settings, but tenants who
  // toggle the attendance module to disabled may expect their
  // method-config changes to take effect on the same call cycle.
  clearModuleCache(actor.tenantId);

  await recordAudit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "STORE_UPDATED",
    entityType: "Store",
    entityId: storeId,
    oldData: {
      ipWhitelist: existing.ipWhitelist,
      attendanceMethods: existing.attendanceMethods,
    },
    newData: {
      ipWhitelist: row.ipWhitelist,
      attendanceMethods: row.attendanceMethods,
    },
  });

  return row;
}

// ── Utility ─────────────────────────────────────────────────────────────────

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
