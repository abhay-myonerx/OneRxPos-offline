import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";
import { config } from "@/config";
import { deriveLocalDbKey, keyToHex } from "./key-derivation";

export type LocalDatabase = Database.Database;

// Open a SQLCipher-encrypted DB with a raw 32-byte key + WAL. Pure of config
// so it is unit-testable with a temp file.
export function openLocalDb(opts: { path: string; key: Buffer }): LocalDatabase {
  if (opts.path !== ":memory:") mkdirSync(dirname(opts.path), { recursive: true });
  const db = new Database(opts.path);
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key="x'${keyToHex(opts.key)}'"`);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
  } catch (err) {
    // A wrong key surfaces here (e.g. on the journal_mode pragma) rather than
    // on first query. Close now so the native handle isn't leaked open —
    // otherwise callers/tests that never see a usable db can't clean up the
    // file (Windows in particular locks it until the handle is closed).
    db.close();
    throw err;
  }
}

// globalThis singleton (mirrors config/database.ts) built from config.
const g = globalThis as unknown as { __rxposLocalDb?: LocalDatabase };

export function getLocalDb(): LocalDatabase {
  if (g.__rxposLocalDb) return g.__rxposLocalDb;
  if (!config.LOCAL_DB_MASTER_KEY)
    throw new Error("LOCAL_DB_MASTER_KEY is required for the local DB");
  const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY, config.SYNC_DEVICE_ID);
  g.__rxposLocalDb = openLocalDb({ path: config.LOCAL_DB_PATH, key });
  return g.__rxposLocalDb;
}

export function closeLocalDb(): void {
  g.__rxposLocalDb?.close();
  g.__rxposLocalDb = undefined;
}
