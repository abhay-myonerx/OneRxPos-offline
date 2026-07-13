// Shared low-stock notification (3H.2). Extracted from the (now-inert, BullMQ)
// lowStockAlert job so BOTH that job and the Redis-free inline reorder trigger
// raise the identical alert without a duplicated copy. Redis-free: persists an
// audit row + fans out an in-app notification (notifyRoles best-effort).

import { prisma } from "../../config/database";
import { Role, NotificationType } from "../../generated/prisma/enums";
import { logger } from "../../shared/utils/logger";
import { notifyRoles } from "../notification/notification.service";

export interface LowStockAlertArgs {
  tenantId: string;
  storeId: string;
  productId: string;
  productName: string;
  currentQuantity: number;
  reorderPoint: number;
}

export async function notifyLowStock(args: LowStockAlertArgs): Promise<void> {
  const { tenantId, storeId, productId, productName, currentQuantity, reorderPoint } = args;

  logger.warn(
    { tenantId, storeId, productId, productName, currentQuantity, reorderPoint },
    `LOW STOCK ALERT: "${productName}" has ${currentQuantity} units (threshold: ${reorderPoint})`,
  );

  // Audit row for dashboard queries. Best-effort — never let it throw into a
  // checkout post-commit path.
  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "inventory.low_stock_alert",
        entityType: "product",
        entityId: productId,
        newData: { productName, storeId, currentQuantity, reorderPoint, alertedAt: new Date().toISOString() },
      },
    });
  } catch (err) {
    logger.error({ err, productId }, "notifyLowStock: audit write failed");
  }

  // In-app notification to store managers + tenant admins. `notifyRoles`
  // swallows its own errors and never throws.
  await notifyRoles(
    tenantId,
    [Role.ADMIN, Role.MANAGER],
    {
      type: NotificationType.INVENTORY,
      title: `Low stock: ${productName}`,
      body: `Only ${currentQuantity} unit(s) left (reorder point ${reorderPoint}).`,
      link: `/products/${productId}`,
      data: { productId, storeId, currentQuantity, reorderPoint },
    },
    { storeId },
  );
}
