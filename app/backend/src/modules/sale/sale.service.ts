import { prisma, TenantPrismaClient } from "../../config/database";
import { ciContains } from "../../shared/utils/ci-match";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import { applyStockDelta } from "../inventory/stockUpsert";
import type { ListSalesInput, VoidSaleInput, ReturnSaleInput } from "./sale.validation";

// ── List sales ─────────────────────────────────────────────────────────────────

export async function listSales(db: TenantPrismaClient, filters: ListSalesInput) {
  const where: Record<string, unknown> = {};

  if (filters.storeId) where.storeId = filters.storeId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.cashierId) where.cashierId = filters.cashierId;
  if (filters.status) where.status = filters.status;
  if (filters.invoiceNo) {
    where.invoiceNo = ciContains(filters.invoiceNo);
  }
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lte: filters.dateTo }),
    };
  }

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    db.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        cashier: { select: { id: true, firstName: true, lastName: true } },
        store: { select: { id: true, name: true, code: true } },
        payments: { select: { method: true, amount: true, status: true } },
        _count: { select: { items: true } },
      },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip,
      take: filters.limit,
    }),
    db.sale.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
      hasMore: filters.page * filters.limit < total,
    },
  };
}

// ── Get sale by ID ─────────────────────────────────────────────────────────────

export async function getSaleById(db: TenantPrismaClient, saleId: string) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, sku: true, barcode: true },
          },
          variant: { select: { id: true, name: true, sku: true } },
        },
      },
      payments: true,
      customer: { select: { id: true, name: true, phone: true, email: true } },
      cashier: { select: { id: true, firstName: true, lastName: true } },
      store: { select: { id: true, name: true, code: true } },
      shift: { select: { id: true, openedAt: true } },
    },
  });

  if (!sale) throw new NotFoundError("Sale", saleId);

  return {
    ...sale,
    _links: {
      receipt: `/api/v1/receipts/sale/${sale.id}`,
      receiptHtml: `/api/v1/receipts/sale/${sale.id}?format=html`,
      receiptThermal: `/api/v1/receipts/sale/${sale.id}?format=thermal`,
      receiptPreview: `/api/v1/receipts/sale/${sale.id}/preview`,
    },
  };
}

// ── Void sale ──────────────────────────────────────────────────────────────────

export async function voidSale(
  db: TenantPrismaClient,
  tenantId: string,
  saleId: string,
  userId: string,
  input: VoidSaleInput,
) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });

  if (!sale) throw new NotFoundError("Sale", saleId);

  if (sale.status === "VOIDED") {
    throw new ValidationError("Sale is already voided");
  }
  if (sale.status === "RETURNED") {
    throw new ValidationError("Returned sales cannot be voided");
  }

  await prisma.$transaction(async (tx) => {
    // Restore stock atomically via applyStockDelta — safe under concurrency.
    for (const item of sale.items) {
      const newQty = await applyStockDelta(
        // Casting: stockUpsert helpers are typed against the extended
        // client; the inner prisma tx lacks the extension but the raw
        // SQL still runs correctly since it addresses the table directly.
        tx as never,
        sale.storeId,
        item.productId,
        item.variantId ?? null,
        item.quantity,
      );

      await tx.stockMovement.create({
        data: {
          tenantId,
          storeId: sale.storeId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          type: "SALE_RETURN",
          quantityChange: item.quantity,
          quantityAfter: newQty,
          notes: `Void of sale ${sale.invoiceNo}`,
          performedBy: userId,
          referenceId: sale.id,
          referenceType: "SALE_VOID",
        },
      });
    }

    // Reverse customer balance if there was a due amount
    if (sale.customerId && Number(sale.dueAmount) > 0) {
      await tx.customer.update({
        where: { id: sale.customerId },
        data: { currentBalance: { decrement: Number(sale.dueAmount) } },
      });
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "VOIDED",
        notes: input.notes ? `${sale.notes ?? ""}\nVoid reason: ${input.notes}`.trim() : sale.notes,
      },
    });
  });

  logger.info({ tenantId, saleId, invoiceNo: sale.invoiceNo }, "Sale voided");

  return db.sale.findUnique({
    where: { id: saleId },
    include: { items: true, payments: true },
  });
}

// ── Return sale ────────────────────────────────────────────────────────────────

export async function returnSale(
  db: TenantPrismaClient,
  tenantId: string,
  saleId: string,
  userId: string,
  input: ReturnSaleInput,
) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: { items: true },
  });

  if (!sale) throw new NotFoundError("Sale", saleId);

  if (sale.status === "VOIDED") {
    throw new ValidationError("Voided sales cannot be returned");
  }
  if (sale.status === "RETURNED") {
    throw new ValidationError("Sale has already been returned");
  }

  // Determine which items to return
  const itemsToReturn = input.items?.length
    ? sale.items.filter((si) => input.items!.some((ri) => ri.saleItemId === si.id))
    : sale.items; // full return if no items specified

  if (itemsToReturn.length === 0) {
    throw new ValidationError("No matching sale items found to return");
  }

  // Build quantity map for partial returns
  const returnQtyMap = new Map<string, number>();
  if (input.items?.length) {
    for (const ri of input.items) {
      const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
      if (!saleItem) throw new NotFoundError("Sale item", ri.saleItemId);
      if (ri.quantity > saleItem.quantity) {
        throw new ValidationError(
          `Return quantity (${ri.quantity}) exceeds sold quantity (${saleItem.quantity})`,
        );
      }
      returnQtyMap.set(ri.saleItemId, ri.quantity);
    }
  } else {
    for (const si of sale.items) {
      returnQtyMap.set(si.id, si.quantity);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of itemsToReturn) {
      const returnQty = returnQtyMap.get(item.id) ?? item.quantity;

      // Atomic stock restoration
      const newQty = await applyStockDelta(
        tx as never,
        sale.storeId,
        item.productId,
        item.variantId ?? null,
        returnQty,
      );

      await tx.stockMovement.create({
        data: {
          tenantId,
          storeId: sale.storeId,
          productId: item.productId,
          variantId: item.variantId ?? null,
          type: "SALE_RETURN",
          quantityChange: returnQty,
          quantityAfter: newQty,
          notes: `Return of sale ${sale.invoiceNo}`,
          performedBy: userId,
          referenceId: sale.id,
          referenceType: "SALE_RETURN",
        },
      });
    }

    // Reverse loyalty points if fully returned and customer exists.
    // Note: partial return loyalty proration is a Phase 2 fix (I7).
    const isFullReturn = !input.items?.length;
    if (isFullReturn && sale.customerId) {
      const loyaltyTx = await tx.loyaltyTransaction.findFirst({
        where: { saleId: sale.id, type: "EARNED" },
      });

      if (loyaltyTx) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { loyaltyPoints: { decrement: loyaltyTx.points } },
        });

        await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            customerId: sale.customerId,
            type: "ADJUSTED",
            points: -loyaltyTx.points,
            saleId: sale.id,
            notes: `Points reversed on return of ${sale.invoiceNo}`,
          },
        });
      }
    }

    const newStatus = isFullReturn ? "RETURNED" : "PARTIAL";

    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: newStatus,
        notes: input.notes ? `${sale.notes ?? ""}\nReturn note: ${input.notes}`.trim() : sale.notes,
      },
    });
  });

  logger.info({ tenantId, saleId, invoiceNo: sale.invoiceNo }, "Sale returned");

  return db.sale.findUnique({
    where: { id: saleId },
    include: { items: true, payments: true },
  });
}
