"use strict";
// SN-4 Task 4: one-shot child process that opens the store-node's already-
// schema'd encrypted SQLite file directly (better-sqlite3-multiple-ciphers,
// same PRAGMA sequence as verify-native.mjs / rx-pos-backend's
// sqlcipher-shim: cipher='sqlcipher' -> key -> journal_mode=WAL ->
// foreign_keys=ON) and reports how many `sync_outbox` rows exist. Used only
// by the offline-acceptance harness (src/store-node/__tests__/
// offline-acceptance.test.ts) to prove SN-3's trigger-captured outbox rows
// accumulated locally with no cloud configured — never used by the app.
//
// Spawned under Electron-as-node with the SAME `--require
// electron-native-require-hook.cjs` + RXPOS_NATIVE_SQLCIPHER_ENTRY
// convention as push-sqlite-schema-oneshot.cjs / launcher.ts, because this
// script also transitively requires "better-sqlite3-multiple-ciphers" and
// must resolve the Electron ABI-146 copy, not the backend's own plain-Node
// build.
//
// Inputs come from env vars, not argv (mirrors push-sqlite-schema-oneshot.cjs):
//   RXPOS_QUERY_DB_PATH     — the encrypted store-node DB file to open.
//   RXPOS_QUERY_DB_KEY_HEX  — the derived SQLCipher key, hex-encoded.
//
// Prints a single JSON line to stdout: {"pending":N,"total":N} and exits 0.
const dbPath = process.env.RXPOS_QUERY_DB_PATH;
const keyHex = process.env.RXPOS_QUERY_DB_KEY_HEX;

if (!dbPath || !keyHex) {
  console.error(
    "query-outbox-count-oneshot: RXPOS_QUERY_DB_PATH and RXPOS_QUERY_DB_KEY_HEX are both required",
  );
  process.exit(1);
}

let Database;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Database = require("better-sqlite3-multiple-ciphers");
} catch (err) {
  console.error(
    "query-outbox-count-oneshot: failed to require('better-sqlite3-multiple-ciphers')",
    err,
  );
  process.exit(1);
}

let db;
try {
  db = new Database(dbPath, { readonly: true });
  db.pragma("cipher='sqlcipher'");
  db.pragma(`key="x'${keyHex}'"`);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const pendingRow = db
    .prepare("SELECT COUNT(*) AS c FROM sync_outbox WHERE status = ?")
    .get("pending");
  const totalRow = db.prepare("SELECT COUNT(*) AS c FROM sync_outbox").get();

  process.stdout.write(
    JSON.stringify({ pending: pendingRow.c, total: totalRow.c }) + "\n",
  );
  db.close();
  process.exit(0);
} catch (err) {
  try {
    db?.close();
  } catch {
    // ignore
  }
  console.error("query-outbox-count-oneshot: query failed:", err);
  process.exit(1);
}
