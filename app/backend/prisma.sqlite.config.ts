// prisma.sqlite.config.ts
//
// CLI config for the store-node SQLCipher-encrypted SQLite schema. Mirrors
// prisma.config.ts but points at prisma/schema.sqlite.prisma and wires the
// keyed driver-adapter (Task 1's `buildSqliteAdapter`) into Prisma's new JS
// schema engine so `prisma db push` opens the SAME encrypted connection the
// runtime uses (src/config/database.ts) instead of the native Rust engine's
// unkeyed sqlite driver.
//
// Path/key derivation is IDENTICAL to src/config/database.ts#createSqlitePrismaClient:
// LOCAL_DB_PATH (not SQLITE_DATABASE_URL) + LOCAL_DB_MASTER_KEY/SYNC_DEVICE_ID.
//
// NOTE on `db push`: this config DOES correctly route `prisma db push`
// through the keyed better-sqlite3 driver adapter (verified with
// DEBUG=prisma:driver-adapter:* — every query goes through
// `@prisma/adapter-better-sqlite3`, i.e. our SQLCipher shim, not a native
// unkeyed engine). It is kept here because it also makes `prisma studio`
// (and any other adapter-aware CLI command) work against the encrypted file.
// `db push` itself is NOT used for the actual push, though — Prisma's sqlite
// DDL generator emits invalid unquoted JSON literal defaults (`DEFAULT {}` /
// `DEFAULT []`) for `Json @default("{}")`/`@default("[]")` fields, which
// SQLite rejects. That's a Prisma engine bug independent of encryption (it
// reproduces identically via `prisma migrate diff`). The real push path is
// `scripts/push-sqlite-schema.ts` (`npm run db:push:sqlite`), which
// generates the same DDL via `migrate diff --from-empty`, patches that one
// known-bad pattern, and applies it through this same keyed adapter.
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { buildSqliteAdapter } from "./src/local/sqlcipher-adapter";
import { deriveLocalDbKey } from "./src/local/key-derivation";

export default defineConfig({
  schema: "prisma/schema.sqlite.prisma",
  experimental: {
    adapter: true,
  },
  engine: "js",
  async adapter() {
    const masterKey = process.env.LOCAL_DB_MASTER_KEY;
    if (!masterKey) {
      throw new Error("LOCAL_DB_MASTER_KEY environment variable is not set");
    }
    const deviceId = process.env.SYNC_DEVICE_ID ?? "dev-device-0001";
    const path = process.env.LOCAL_DB_PATH ?? "./data/store-node.db";
    const key = deriveLocalDbKey(masterKey, deviceId);
    return buildSqliteAdapter({ path, key });
  },
});
