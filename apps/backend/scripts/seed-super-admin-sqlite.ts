// scripts/seed-super-admin-sqlite.ts
/**
 * CLI entrypoint for `npm run db:seed:sqlite`. All logic lives in
 * src/local/seed-super-admin-sqlite.ts (kept under tsc's `rootDir` so it
 * stays type-checked and unit-testable from src/local/__tests__); this file
 * just wires it to `dotenv`, exit codes, and `prisma.$disconnect()` for a
 * one-shot CLI run.
 *
 * Usage:
 *   DATA_BACKEND=sqlite LOCAL_DB_MASTER_KEY=... npx tsx -r tsconfig-paths/register scripts/seed-super-admin-sqlite.ts
 */
import "dotenv/config";

import { prisma } from "../src/config/database";
import { seedSuperAdminSqlite } from "../src/local/seed-super-admin-sqlite";

if (require.main === module) {
  seedSuperAdminSqlite()
    .catch((err) => {
      console.error("❌ Seed failed:");
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
