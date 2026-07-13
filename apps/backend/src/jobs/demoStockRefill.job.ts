// Runs every 5 minutes (when DEMO_MODE=true).
// Finds every StoreStock row where quantity === 0 and refills it
// to a random value between 50 and 200 so demo users never hit
// "out of stock" walls during exploration.

import { Job } from "bullmq";
import { prisma } from "../config/database";
import { logger } from "../shared/utils/logger";

export async function processDemoStockRefill(_job: Job): Promise<void> {
  const emptyStocks = await prisma.storeStock.findMany({
    where: { quantity: 0 },
    select: { id: true },
  });

  if (emptyStocks.length === 0) {
    logger.info("Demo stock refill: no empty stocks found, skipping");
    return;
  }

  // Random 50–200 per product so the demo data looks varied
  await prisma.$transaction(
    emptyStocks.map(({ id }) =>
      prisma.storeStock.update({
        where: { id },
        data: { quantity: Math.floor(Math.random() * 151) + 50 },
      }),
    ),
  );

  logger.info({ count: emptyStocks.length }, "Demo stock refill: restocked empty products");
}
