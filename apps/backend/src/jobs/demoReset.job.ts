// Runs every 2 hours (when DEMO_MODE=true).
// Calls the seed-demo main() to wipe and re-seed all demo data.
// BullMQ's built-in job lock prevents concurrent resets.

import { Job } from "bullmq";
import { logger } from "../shared/utils/logger";

export async function processDemoReset(_job: Job): Promise<void> {
  logger.info("Demo reset: starting demo data reset...");

  // Dynamic require avoids TypeScript rootDir restrictions since seed-demo.ts
  // lives in prisma/ (outside src/). seed-demo exports main() and guards
  // its auto-run with require.main === module, so this import is safe.
  const { main } = require("../../prisma/seed-demo") as { main: () => Promise<void> };
  await main();

  logger.info("Demo reset: demo data reset complete");
}
