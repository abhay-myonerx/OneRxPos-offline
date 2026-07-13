"use strict";
// SN-4 Task 3: one-shot child process that pushes the store-node SQLite
// schema (rx-pos-backend/src/local/sqlite-push.ts's pushSqliteSchema) into a
// FRESH encrypted DB file, then exits. Spawned by
// src/store-node/onboarding.ts under Electron-as-node — same
// `--require electron-native-require-hook.cjs` convention launcher.ts uses,
// because this script also transitively requires
// "better-sqlite3-multiple-ciphers" (via the backend's sqlcipher-adapter),
// and the backend's OWN node_modules copy of that module is built for plain
// Node, not the Electron ABI this child runs under.
//
// Inputs come from env vars, NOT argv, so the raw SQLCipher key never shows
// up in a process listing (Task Manager / `ps` / argv-based log scraping):
//   RXPOS_PUSH_BACKEND_DIR — rx-pos-backend repo root (its dist/local/
//     sqlite-push.js is required from here; pushSqliteSchema itself shells
//     out to `npx prisma migrate diff` relative to that root).
//   RXPOS_PUSH_DB_PATH     — target encrypted DB file (must not exist yet;
//     pushSqliteSchema's DDL is plain CREATE TABLE, not IF NOT EXISTS).
//   RXPOS_PUSH_DB_KEY_HEX  — the derived SQLCipher key, hex-encoded.
//
// Does NOT seed an admin/tenant — the schema is pushed empty. The existing
// backend /api/v1/setup/status + /setup/complete endpoints (consumed by the
// existing frontend Setup wizard) are how the real admin/tenant get created,
// entirely offline, on first launch.
// This file IS a CJS one-shot script by construction (see file header) —
// requires must load synchronously via require(), same convention as
// electron-native-require-hook.cjs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");

const backendDir = process.env.RXPOS_PUSH_BACKEND_DIR;
const dbPath = process.env.RXPOS_PUSH_DB_PATH;
const keyHex = process.env.RXPOS_PUSH_DB_KEY_HEX;

if (!backendDir || !dbPath || !keyHex) {
  console.error(
    "push-sqlite-schema-oneshot: RXPOS_PUSH_BACKEND_DIR, RXPOS_PUSH_DB_PATH and " +
      "RXPOS_PUSH_DB_KEY_HEX are all required",
  );
  process.exit(1);
}

let pushSqliteSchema;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ pushSqliteSchema } = require(path.join(backendDir, "dist", "local", "sqlite-push.js")));
} catch (err) {
  console.error(
    "push-sqlite-schema-oneshot: failed to load pushSqliteSchema from " +
      `${backendDir}/dist/local/sqlite-push.js — was the backend built ` +
      "(cd rx-pos-backend && npm run build)?",
    err,
  );
  process.exit(1);
}

pushSqliteSchema({ path: dbPath, key: Buffer.from(keyHex, "hex") })
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("push-sqlite-schema-oneshot: pushSqliteSchema failed:", err);
    process.exit(1);
  });
