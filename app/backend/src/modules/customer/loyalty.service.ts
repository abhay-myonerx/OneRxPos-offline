import { prisma, TenantPrismaClient } from "../../config/database";
import { NotFoundError } from "../../shared/errors/NotFoundError";
import { ValidationError } from "../../shared/errors/ValidationError";
import { logger } from "../../shared/utils/logger";
import type { AdjustPointsInput } from "./customer.validation";

// ── Get loyalty program config ──────────────────────────────────────────────────

export async function getLoyaltyProgram(db: TenantPrismaClient, tenantId: string) {
  const program = await db.loyaltyProgram.findUnique({
    where: { tenantId },
    include: { tiers: { orderBy: { sortOrder: "asc" } } },
  });

  return program;
}

// ── Get customer loyalty transactions ───────────────────────────────────────────

export async function getCustomerLoyaltyHistory(
  db: TenantPrismaClient,
  customerId: string,
  page: number = 1,
  limit: number = 20,
) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer", customerId);

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    db.loyaltyTransaction.findMany({
      where: { customerId },
      include: {
        sale: { select: { id: true, invoiceNo: true, grandTotal: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.loyaltyTransaction.count({ where: { customerId } }),
  ]);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      loyaltyPoints: customer.loyaltyPoints,
    },
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

// ── Manual adjust loyalty points ────────────────────────────────────────────────

export async function adjustPoints(
  db: TenantPrismaClient,
  tenantId: string,
  customerId: string,
  input: AdjustPointsInput,
) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw new NotFoundError("Customer", customerId);

  const newBalance = customer.loyaltyPoints + input.points;
  if (newBalance < 0) {
    throw new ValidationError(
      `Cannot deduct ${Math.abs(input.points)} points — customer only has ${customer.loyaltyPoints}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newBalance },
    });

    const transaction = await tx.loyaltyTransaction.create({
      data: {
        tenantId,
        customerId,
        type: input.points > 0 ? "ADJUSTED" : "ADJUSTED",
        points: input.points,
        notes: input.notes ?? "Manual adjustment",
      },
    });

    logger.info(
      { tenantId, customerId, points: input.points, newBalance },
      "Loyalty points adjusted",
    );

    return { transaction, newBalance };
  });
}
