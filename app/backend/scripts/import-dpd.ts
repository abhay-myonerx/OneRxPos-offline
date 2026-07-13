// Phase 2.1 — DPD import CLI.
//
//   npm run import:dpd            # imports the bundled sample extract
//   npm run import:dpd -- <dir>   # imports a real DPD extract directory
//
// Joins the DPD extract files, maps to DrugProduct rows, and upserts by DIN
// (idempotent). Prints an imported/updated summary.

import "dotenv/config"; // load DATABASE_URL before the db client is constructed
import { prisma } from "../src/config/database";
import { importDpd, DEFAULT_SAMPLE_DIR } from "../src/modules/drug/dpd-import.service";

async function main(): Promise<void> {
  const dir = process.argv[2] || DEFAULT_SAMPLE_DIR;
  const usingSample = dir === DEFAULT_SAMPLE_DIR;

  console.log(`[import:dpd] reading DPD extract from: ${dir}${usingSample ? " (bundled sample)" : ""}`);

  const summary = await importDpd(prisma, dir);

  console.log(
    `[import:dpd] done — parsed ${summary.parsed}, imported ${summary.imported} new, updated ${summary.updated} existing.`,
  );
}

main()
  .catch((err) => {
    console.error("[import:dpd] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
