// scripts/push-sqlite-schema.ts
//
// CLI entrypoint for `npm run db:push:sqlite`. All logic lives in
// src/local/sqlite-push.ts (kept under tsc's `rootDir` so it stays
// type-checked and unit-testable from src/local/__tests__); this file just
// wires it to env vars and process exit codes for a one-shot CLI run.
//
// Reads the same env vars the runtime resolver
// (src/config/database.ts#createSqlitePrismaClient) uses, so the file this
// writes to is guaranteed to be the file the app + seed script open.
import { pushSqliteSchema } from "../src/local/sqlite-push";

if (require.main === module) {
  void (async () => {
    // Loaded lazily, after `dotenv/config`, so a standalone invocation of
    // this script only needs LOCAL_DB_MASTER_KEY (+ optional LOCAL_DB_PATH /
    // SYNC_DEVICE_ID) set — not the full app config (JWT/license/etc.
    // secrets), even though importing "../src/config" would also work once
    // .env is populated.
    await import("dotenv/config");
    const { config } = await import("../src/config");
    const { deriveLocalDbKey } = await import("../src/local/key-derivation");

    if (!config.LOCAL_DB_MASTER_KEY) {
      console.error("❌ LOCAL_DB_MASTER_KEY environment variable is not set.");
      process.exit(1);
    }

    const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY, config.SYNC_DEVICE_ID);
    console.log(`Pushing sqlite schema -> ${config.LOCAL_DB_PATH}`);
    await pushSqliteSchema({ path: config.LOCAL_DB_PATH, key });
    console.log("✅ Schema pushed.");
  })().catch((err) => {
    console.error("❌ db:push:sqlite failed:");
    console.error(err);
    process.exit(1);
  });
}
