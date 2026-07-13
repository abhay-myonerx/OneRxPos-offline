// scripts/generate-sqlite-ddl.ts
// ─────────────────────────────────────────────────────────────────────────────
// CLI entrypoint for `npm run db:ddl:sqlite` — a BUILD-TIME step (SN-5 Task 2)
// that pre-generates the sqlite table DDL and writes it to
// `prisma/sqlite-schema.sql`, a committed, deterministic build artifact.
//
// Reuses the EXACT generation path `pushSqliteSchema` used to run live at
// first-run onboarding — `generateSqliteDdl` (shells `prisma migrate diff
// --from-empty`) piped through `fixJsonDefaults` (the Prisma 6.19.3
// unquoted-JSON-default patch) — both imported from src/local/sqlite-push.ts,
// NOT re-implemented here. `pushSqliteSchema` now prefers applying THIS file
// over shelling out to the Prisma CLI (see that module's header comment for
// why); this script is the only thing that should ever produce it.
//
// Regenerate with `npx tsx -r tsconfig-paths/register scripts/generate-sqlite-ddl.ts`
// (or `npm run db:ddl:sqlite`) any time `prisma/schema.sqlite.prisma` changes
// — the same "generated file, do not hand-edit, re-derive after a schema
// change" contract as scripts/derive-sqlite-schema.ts and
// scripts/generate-sync-triggers.ts.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fixJsonDefaults, generateSqliteDdl } from "../src/local/sqlite-push";

function main(): void {
  const outPath = path.join(__dirname, "..", "prisma", "sqlite-schema.sql");
  const ddl = fixJsonDefaults(generateSqliteDdl());

  const header =
    "-- prisma/sqlite-schema.sql\n" +
    "-- ============================================================================\n" +
    "-- GENERATED FILE — DO NOT HAND-EDIT.\n" +
    "-- Pre-generated CREATE TABLE / CREATE INDEX DDL for prisma/schema.sqlite.prisma,\n" +
    "-- produced by scripts/generate-sqlite-ddl.ts (SN-5 Task 2) via\n" +
    "-- `prisma migrate diff --from-empty --to-schema-datamodel schema.sqlite.prisma\n" +
    "-- --script`, patched by src/local/sqlite-push.ts#fixJsonDefaults. Committed so\n" +
    "-- the packaged desktop app's first-run onboarding needs NO Prisma CLI at\n" +
    "-- runtime — src/local/sqlite-push.ts#pushSqliteSchema applies this file\n" +
    "-- directly through the keyed SQLCipher adapter.\n" +
    "-- Regenerate with: npx tsx -r tsconfig-paths/register scripts/generate-sqlite-ddl.ts\n" +
    "-- after any change to prisma/schema.sqlite.prisma.\n" +
    "-- ============================================================================\n\n";
  const out = header + ddl;

  fs.writeFileSync(outPath, out, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath} (${out.length} bytes)`);
}

if (require.main === module) {
  main();
}
