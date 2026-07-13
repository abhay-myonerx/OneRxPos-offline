// Inter-store stock transfer lifecycle — REWRITTEN.
//
//   createTransfer  -> PENDING        no stock movement
//   shipTransfer    -> IN_TRANSIT     deducts source stock + TRANSFER_OUT
//   receiveTransfer -> COMPLETED      adds dest stock + TRANSFER_IN, sets completedAt
//   cancelTransfer  -> CANCELLED      from PENDING (no stock change)
//                                     from IN_TRANSIT (restores source +
//                                                      TRANSFER_IN reversing
//                                                      movement on source)
//
// Key correctness properties:
//   - Lifecycle deduction happens at SHIP, not at CREATE.
//   - Status guards are enforced *inside* the transaction via update-where-status
//     so concurrent calls can never double-process.
//   - Stock writes use a raw INSERT ... ON CONFLICT upsert so the upsert is a
//     single atomic statement (no findFirst -> update/create race).
//   - listTransfers explicitly scopes by tenantId AND interprets `storeId` as
//     `(fromStoreId = X OR toStoreId = X)`. Non-admins are auto-scoped to their
//     accessible stores.
//   - All status transitions write a StockMovement row with referenceType =
//     "STOCK_TRANSFER" and referenceId = transfer.id for audit traceability.

import { Prisma } from "../../generated/prisma/client";
import { TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { AuthorizationError } from "../../shared/errors/AuthorizationError";
import { InsufficientStockError } from "../../shared/errors/InsufficientStockError";
import { logger } from "../../shared/utils/logger";
import { buildPagination, PaginationParams } from "../../shared/utils/pagination";
import type { Role } from "../../generated/prisma/enums";
import { applyStockDelta, readStockQuantity, type Tx } from "./stockUpsert";
import type {
  CreateTransferInput,
  ReceiveTransferInput,
  ListTransfersInput,
} from "./inventory.validation";
import { assertVariableProductHasVariant } from "../product/product.validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RequestUser {
  id: string;
  role: Role;
  storeId: string | null;
  storeIds: string[];
}

// ---------------------------------------------------------------------------
// Internal: store-access guard for non-admin users
// ---------------------------------------------------------------------------

function userCanAccessStore(user: RequestUser, storeId: string): boolean {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return user.storeId === storeId || user.storeIds.includes(storeId);
}

function assertCanAccessEitherStore(
  user: RequestUser,
  fromStoreId: string,
  toStoreId: string,
  action: string,
) {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return;
  const canAccess =
    user.storeId === fromStoreId ||
    user.storeId === toStoreId ||
    user.storeIds.includes(fromStoreId) ||
    user.storeIds.includes(toStoreId);
  if (!canAccess) {
    throw new AuthorizationError(`You do not have permission to ${action} this transfer`);
  }
}

// ---------------------------------------------------------------------------
// Internal: collision-safe transfer number generator
// ---------------------------------------------------------------------------

async function generateTransferNumber(tx: Tx, tenantId: string): Promise<string> {
  // Up to 5 retries on count-based collision. The compound unique
  // (tenantId, transferNumber) catches races; we just retry.
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await tx.stockTransfer.count({ where: { tenantId } });
    const candidate = `TRF-${String(count + 1 + attempt).padStart(6, "0")}`;
    const exists = await tx.stockTransfer.findFirst({
      where: { tenantId, transferNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // Fallback: timestamp suffix guarantees uniqueness
  return `TRF-${Date.now().toString().slice(-9)}`;
}

// ---------------------------------------------------------------------------
// Standard include shape for transfer responses
// ---------------------------------------------------------------------------

const transferInclude = {
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true, sellPrice: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
  fromStore: { select: { id: true, name: true, code: true } },
  toStore: { select: { id: true, name: true, code: true } },
} satisfies Prisma.StockTransferInclude;

// ===========================================================================
// CREATE TRANSFER  ->  PENDING (no stock movement)
// ===========================================================================

export async function createTransfer(
  db: TenantPrismaClient,
  tenantId: string,
  user: RequestUser,
  input: CreateTransferInput,
) {
  if (input.fromStoreId === input.toStoreId) {
    throw new ValidationError("Source and destination stores must be different");
  }

  // The user must have access to AT LEAST the source store to draft a transfer.
  if (!userCanAccessStore(user, input.fromStoreId)) {
    throw new AuthorizationError("You do not have permission to create transfers from this store");
  }

  const [fromStore, toStore] = await Promise.all([
    db.store.findFirst({ where: { id: input.fromStoreId, tenantId } }),
    db.store.findFirst({ where: { id: input.toStoreId, tenantId } }),
  ]);
  if (!fromStore) throw new NotFoundError("Store", input.fromStoreId);
  if (!toStore) throw new NotFoundError("Store", input.toStoreId);

  const productIds = [...new Set(input.items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, tenantId },
    select: { id: true, productType: true, name: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const line of input.items) {
    const p = productById.get(line.productId);
    if (!p) throw new NotFoundError("Product", line.productId);
    assertVariableProductHasVariant(
      p.productType,
      line.variantId,
      `Transfer line for "${p.name}" requires variantId because this product is variable.`,
    );
  }

  // Soft pre-check: warn early if source clearly doesn't have enough.
  // (The hard check happens at ship time inside a transaction.)
  for (const item of input.items) {
    const row = await db.storeStock.findFirst({
      where: {
        storeId: input.fromStoreId,
        productId: item.productId,
        variantId: item.variantId ?? null,
      },
      select: { quantity: true },
    });
    const current = row?.quantity ?? 0;
    if (current < item.quantity) {
      throw new InsufficientStockError(item.productId, current, item.quantity);
    }
  }

  const transfer = await db.$transaction(async (tx) => {
    const transferNumber = await generateTransferNumber(tx, tenantId);

    return tx.stockTransfer.create({
      data: {
        tenantId,
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        transferNumber,
        status: "PENDING",
        notes: input.notes ?? null,
        createdBy: user.id,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
          })),
        },
      },
      include: transferInclude,
    });
  });

  logger.info(
    { tenantId, transferId: transfer.id, transferNumber: transfer.transferNumber },
    "Stock transfer drafted (PENDING)",
  );

  return transfer;
}

// ===========================================================================
// SHIP TRANSFER  ->  PENDING -> IN_TRANSIT (deducts source stock)
// ===========================================================================

export async function shipTransfer(
  db: TenantPrismaClient,
  tenantId: string,
  user: RequestUser,
  transferId: string,
) {
  const transfer = await db.stockTransfer.findFirst({
    where: { id: transferId, tenantId },
    include: { items: true, fromStore: { select: { id: true, name: true } } },
  });
  if (!transfer) throw new NotFoundError("Transfer", transferId);
  assertCanAccessEitherStore(user, transfer.fromStoreId, transfer.toStoreId, "ship");

  if (transfer.status !== "PENDING") {
    throw new ValidationError(`Transfer cannot be shipped from status: ${transfer.status}`);
  }

  await db.$transaction(async (tx) => {
    // 1. Atomic status flip — fails if someone already shipped/cancelled it.
    const updated = await tx.stockTransfer.updateMany({
      where: { id: transferId, status: "PENDING" },
      data: { status: "IN_TRANSIT" },
    });
    if (updated.count === 0) {
      throw new ValidationError("Transfer was modified by another request");
    }

    // 2. Validate ALL stock levels BEFORE deducting any.
    //    Partial-ship = data corruption.
    for (const item of transfer.items) {
      const current = await readStockQuantity(
        tx,
        transfer.fromStoreId,
        item.productId,
        item.variantId,
      );
      if (current < item.quantity) {
        throw new InsufficientStockError(item.productId, current, item.quantity);
      }
    }

    // 3. Deduct + write TRANSFER_OUT for each line.
    for (const item of transfer.items) {
      const after = await applyStockDelta(
        tx,
        transfer.fromStoreId,
        item.productId,
        item.variantId,
        -item.quantity,
      );
      await tx.stockMovement.create({
        data: {
          tenantId,
          storeId: transfer.fromStoreId,
          productId: item.productId,
          variantId: item.variantId,
          type: "TRANSFER_OUT",
          quantityChange: -item.quantity,
          quantityAfter: after,
          notes: `Shipped via transfer ${transfer.transferNumber}`,
          performedBy: user.id,
          referenceId: transfer.id,
          referenceType: "STOCK_TRANSFER",
        },
      });
    }
  });

  logger.info(
    { tenantId, transferId, fromStoreId: transfer.fromStoreId, by: user.id },
    "Transfer shipped",
  );

  return getTransferById(db, tenantId, transferId);
}

// ===========================================================================
// RECEIVE TRANSFER  ->  IN_TRANSIT -> COMPLETED (adds destination stock)
// ===========================================================================

export async function receiveTransfer(
  db: TenantPrismaClient,
  tenantId: string,
  user: RequestUser,
  transferId: string,
  input: ReceiveTransferInput,
) {
  const transfer = await db.stockTransfer.findFirst({
    where: { id: transferId, tenantId },
    include: { items: true, toStore: { select: { id: true, name: true } } },
  });
  if (!transfer) throw new NotFoundError("Transfer", transferId);
  assertCanAccessEitherStore(user, transfer.fromStoreId, transfer.toStoreId, "receive");

  if (transfer.status !== "IN_TRANSIT") {
    throw new ValidationError(
      `Transfer cannot be received in status: ${transfer.status} ` +
        `(must be IN_TRANSIT — ship it first)`,
    );
  }

  await db.$transaction(async (tx) => {
    // 1. Atomic status flip
    const updated = await tx.stockTransfer.updateMany({
      where: { id: transferId, status: "IN_TRANSIT" },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        notes: input.notes
          ? `${transfer.notes ?? ""}\nReceive note: ${input.notes}`.trim()
          : transfer.notes,
      },
    });
    if (updated.count === 0) {
      throw new ValidationError("Transfer was modified by another request");
    }

    // 2. Add to destination + write TRANSFER_IN
    for (const item of transfer.items) {
      const after = await applyStockDelta(
        tx,
        transfer.toStoreId,
        item.productId,
        item.variantId,
        item.quantity,
      );
      await tx.stockMovement.create({
        data: {
          tenantId,
          storeId: transfer.toStoreId,
          productId: item.productId,
          variantId: item.variantId,
          type: "TRANSFER_IN",
          quantityChange: item.quantity,
          quantityAfter: after,
          notes: `Received from transfer ${transfer.transferNumber}`,
          performedBy: user.id,
          referenceId: transfer.id,
          referenceType: "STOCK_TRANSFER",
        },
      });
    }
  });

  logger.info(
    { tenantId, transferId, toStoreId: transfer.toStoreId, by: user.id },
    "Transfer received and completed",
  );

  return getTransferById(db, tenantId, transferId);
}

// ===========================================================================
// CANCEL TRANSFER  ->  PENDING|IN_TRANSIT -> CANCELLED
//   - from PENDING:    pure status flip (no stock was deducted yet)
//   - from IN_TRANSIT: restore source stock + write reversing TRANSFER_IN
//                      movement on the source
// ===========================================================================

export async function cancelTransfer(
  db: TenantPrismaClient,
  tenantId: string,
  user: RequestUser,
  transferId: string,
) {
  const transfer = await db.stockTransfer.findFirst({
    where: { id: transferId, tenantId },
    include: { items: true, fromStore: { select: { id: true, name: true } } },
  });
  if (!transfer) throw new NotFoundError("Transfer", transferId);
  assertCanAccessEitherStore(user, transfer.fromStoreId, transfer.toStoreId, "cancel");

  if (transfer.status !== "PENDING" && transfer.status !== "IN_TRANSIT") {
    throw new ValidationError(`Transfer cannot be cancelled in status: ${transfer.status}`);
  }

  const previousStatus = transfer.status;

  await db.$transaction(async (tx) => {
    // 1. Atomic status flip — guard on the previously-observed status
    const updated = await tx.stockTransfer.updateMany({
      where: { id: transferId, status: previousStatus },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new ValidationError("Transfer was modified by another request");
    }

    // 2. If we had already shipped, give the source its stock back.
    if (previousStatus === "IN_TRANSIT") {
      for (const item of transfer.items) {
        const after = await applyStockDelta(
          tx,
          transfer.fromStoreId,
          item.productId,
          item.variantId,
          item.quantity,
        );
        await tx.stockMovement.create({
          data: {
            tenantId,
            storeId: transfer.fromStoreId,
            productId: item.productId,
            variantId: item.variantId,
            type: "TRANSFER_IN", // returning to source
            quantityChange: item.quantity,
            quantityAfter: after,
            notes: `Reversal — transfer ${transfer.transferNumber} cancelled after shipping`,
            performedBy: user.id,
            referenceId: transfer.id,
            referenceType: "STOCK_TRANSFER",
          },
        });
      }
    }
  });

  logger.info(
    { tenantId, transferId, previousStatus, by: user.id },
    previousStatus === "IN_TRANSIT"
      ? "Transfer cancelled — source stock restored"
      : "Transfer cancelled (no stock change)",
  );

  return getTransferById(db, tenantId, transferId);
}

// ===========================================================================
// LIST TRANSFERS
//
// Filters:
//   - tenantId (always)
//   - status, dateFrom, dateTo (optional)
//   - fromStoreId / toStoreId (optional, exact match — kept for backward compat)
//   - storeId (optional, OR-match across both sides)
//
// Auto-scoping: non-admin users can only see transfers touching one of their
// accessible stores, regardless of what they pass.
// ===========================================================================

export async function listTransfers(
  db: TenantPrismaClient,
  tenantId: string,
  user: RequestUser,
  filters: ListTransfersInput,
  pagination: PaginationParams,
) {
  const where: Prisma.StockTransferWhereInput = { tenantId };
  const andClauses: Prisma.StockTransferWhereInput[] = [];

  if (filters.status) where.status = filters.status;
  if (filters.fromStoreId) where.fromStoreId = filters.fromStoreId;
  if (filters.toStoreId) where.toStoreId = filters.toStoreId;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lte: filters.dateTo }),
    };
  }

  // Explicit storeId filter -> match either side
  if (filters.storeId) {
    andClauses.push({
      OR: [{ fromStoreId: filters.storeId }, { toStoreId: filters.storeId }],
    });
  }

  // Non-admin auto-scope: must touch one of the user's accessible stores
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  if (!isAdmin) {
    const accessible = Array.from(
      new Set([...(user.storeId ? [user.storeId] : []), ...user.storeIds]),
    );
    if (accessible.length === 0) {
      return {
        data: [],
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
      };
    }
    andClauses.push({
      OR: [{ fromStoreId: { in: accessible } }, { toStoreId: { in: accessible } }],
    });
  }

  if (andClauses.length > 0) where.AND = andClauses;

  const [data, total] = await Promise.all([
    db.stockTransfer.findMany({
      where,
      include: transferInclude,
      ...buildPagination(pagination),
    }),
    db.stockTransfer.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.ceil(total / pagination.limit),
      hasMore: pagination.page * pagination.limit < total,
    },
  };
}

// ===========================================================================
// GET SINGLE TRANSFER
// ===========================================================================

export async function getTransferById(
  db: TenantPrismaClient,
  tenantId: string,
  transferId: string,
  user?: RequestUser,
) {
  const transfer = await db.stockTransfer.findFirst({
    where: { id: transferId, tenantId },
    include: transferInclude,
  });
  if (!transfer) throw new NotFoundError("Transfer", transferId);

  // Defence in depth: if a user object was passed, enforce store access.
  if (user) {
    assertCanAccessEitherStore(user, transfer.fromStoreId, transfer.toStoreId, "view");
  }

  return transfer;
}
