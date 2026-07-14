import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";

import { config } from "@/config";

import { deriveLocalDbKey, keyToHex } from "./key-derivation";

import { resolveRxPosDataPath } from "./data-dir";

export type LocalDatabase = Database.Database;

/**
 * Open a SQLCipher-encrypted DB with:
 *
 * - raw 32-byte key
 * - SQLCipher
 * - WAL
 * - foreign keys
 *
 * Pure of application config so it remains unit-testable.
 */
export function openLocalDb(opts: { path: string; key: Buffer }): LocalDatabase {
  if (opts.path !== ":memory:") {
    mkdirSync(dirname(opts.path), {
      recursive: true,
    });
  }

  const db = new Database(opts.path);

  try {
    db.pragma("cipher='sqlcipher'");

    db.pragma(`key="x'${keyToHex(opts.key)}'"`);

    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    return db;
  } catch (err) {
    // Close immediately on an invalid key or initialization failure.
    //
    // This is especially important on Windows because an open native
    // SQLite handle can keep the database file locked.
    db.close();

    throw err;
  }
}

function resolveLocalDbPath(): string {
  const electronDataDir = process.env.RX_POS_DATA_DIR?.trim();

  if (electronDataDir) {
    return resolveRxPosDataPath("rx-pos.db");
  }

  const configuredPath = config.LOCAL_DB_PATH?.trim();

  if (configuredPath === ":memory:") {
    return ":memory:";
  }

  if (configuredPath) {
    return configuredPath;
  }

  return resolveRxPosDataPath("rx-pos.db");
}

// globalThis singleton built from application config.
const g = globalThis as unknown as {
  __rxposLocalDb?: LocalDatabase;
};

export function getLocalDb(): LocalDatabase {
  if (g.__rxposLocalDb) {
    return g.__rxposLocalDb;
  }

  if (!config.LOCAL_DB_MASTER_KEY) {
    throw new Error("LOCAL_DB_MASTER_KEY is required for the local DB");
  }

  if (!config.SYNC_DEVICE_ID) {
    throw new Error("SYNC_DEVICE_ID is required for the local DB");
  }

  const path = resolveLocalDbPath();

  console.log("[local-db] database path:", path);

  const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY, config.SYNC_DEVICE_ID);

  g.__rxposLocalDb = openLocalDb({
    path,
    key,
  });

  return g.__rxposLocalDb;
}

export function closeLocalDb(): void {
  g.__rxposLocalDb?.close();

  g.__rxposLocalDb = undefined;
}
