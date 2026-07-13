import { prisma, TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import type { CollectDueInput, ListPaymentsInput } from "./payment.validation";

// ── List payments ──────────────────────────────────────────────────────────────

export async function listPayments(db: TenantPrismaClient, filters: ListPaymentsInput) {
  const where: Record<string, unknown> = {};

  if (filters.saleId) where.saleId = filters.saleId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.method) where.method = filters.method;
  if (filters.status) where.status = filters.status;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom && { gte: filters.dateFrom }),
      ...(filters.dateTo && { lte: filters.dateTo }),
    };
  }

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    db.payment.findMany({
      where,
      include: {
        sale: { select: { id: true, invoiceNo: true, grandTotal: true, status: true } },
      },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      skip,
      take: filters.limit,
    }),
    db.payment.count({ where }),
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

// ── Get payment by ID ──────────────────────────────────────────────────────────

export async function getPaymentById(db: TenantPrismaClient, paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      sale: {
        select: {
          id: true,
          invoiceNo: true,
          grandTotal: true,
          paidAmount: true,
          dueAmount: true,
          status: true,
        },
      },
    },
  });

  if (!payment) throw new NotFoundError("Payment", paymentId);
  return payment;
}

// ── Collect due payment ────────────────────────────────────────────────────────
//
// Used when a customer pays an outstanding balance (from a PARTIAL sale).
// Steps:
//   1. Validate customer and amount
//   2. If saleId provided, apply to that specific sale
//   3. Create payment record
//   4. Decrement customer balance
//   5. Update sale status from PARTIAL → COMPLETED if fully paid

export async function collectDue(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  input: CollectDueInput,
) {
  const customer = await db.customer.findUnique({
    where: { id: input.customerId },
  });

  if (!customer) throw new NotFoundError("Customer", input.customerId);
  if (Number(customer.currentBalance) <= 0) {
    throw new ValidationError("Customer has no outstanding balance");
  }
  if (input.amount > Number(customer.currentBalance)) {
    throw new ValidationError(
      `Payment amount (${input.amount}) exceeds outstanding balance (${customer.currentBalance})`,
    );
  }

  // If targeting a specific sale, validate it
  if (input.saleId) {
    const sale = await db.sale.findUnique({ where: { id: input.saleId } });
    if (!sale) throw new NotFoundError("Sale", input.saleId);
    if (sale.status !== "PARTIAL") {
      throw new ValidationError("Only PARTIAL sales can accept due payments");
    }
    if (input.amount > Number(sale.dueAmount)) {
      throw new ValidationError(
        `Payment (${input.amount}) exceeds sale due amount (${sale.dueAmount})`,
      );
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Create payment record
    const payment = await tx.payment.create({
      data: {
        tenantId,
        saleId: input.saleId ?? null,
        customerId: input.customerId,
        method: input.method,
        amount: input.amount,
        referenceNo: input.referenceNo ?? null,
        status: "COMPLETED",
        notes: input.notes ?? "Due collection",
      },
    });

    // 2. Decrement customer balance
    await tx.customer.update({
      where: { id: input.customerId },
      data: { currentBalance: { decrement: input.amount } },
    });

    // 3. Update the specific sale if provided
    if (input.saleId) {
      const sale = await tx.sale.findUnique({ where: { id: input.saleId } });
      if (sale) {
        const newPaid = Number(sale.paidAmount) + input.amount;
        const newDue = Math.max(0, Number(sale.grandTotal) - newPaid);
        const newStatus = newDue <= 0 ? "COMPLETED" : "PARTIAL";

        await tx.sale.update({
          where: { id: input.saleId },
          data: {
            paidAmount: newPaid,
            dueAmount: newDue,
            status: newStatus,
          },
        });
      }
    }

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        tenantId,
        userId,
        action: "payment.due_collected",
        entityType: "payment",
        entityId: payment.id,
        newData: {
          customerId: input.customerId,
          saleId: input.saleId,
          amount: input.amount,
          method: input.method,
        },
      },
    });

    logger.info(
      { tenantId, paymentId: payment.id, customerId: input.customerId, amount: input.amount },
      "Due payment collected",
    );

    return payment;
  });
}

// ── Get customer payment history ───────────────────────────────────────────────

export async function getCustomerPayments(
  db: TenantPrismaClient,
  customerId: string,
  page: number = 1,
  limit: number = 20,
) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer", customerId);

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    db.payment.findMany({
      where: { customerId },
      include: {
        sale: { select: { id: true, invoiceNo: true, grandTotal: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.payment.count({ where: { customerId } }),
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
}
