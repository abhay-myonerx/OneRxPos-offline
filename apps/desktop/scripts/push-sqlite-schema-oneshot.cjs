"use strict";

/**
 * SN-4 Task 3:
 *
 * One-shot child process that pushes the store-node SQLite schema into a
 * fresh encrypted database.
 *
 * Spawned by:
 *
 *   apps/desktop/src/store-node/onboarding.ts
 *
 * under Electron-as-Node.
 *
 * IMPORTANT:
 *
 * Backend modules may initialize config / Prisma during require().
 *
 * Therefore DATA_BACKEND and LOCAL_DB_PATH MUST be configured BEFORE
 * requiring:
 *
 *   dist/local/sqlite-push.js
 *
 * Otherwise the backend can resolve its default relative SQLite path
 * against:
 *
 *   C:\Program Files\RX POS\resources\backend
 *
 * and attempt to create:
 *
 *   C:\Program Files\RX POS\resources\backend\data
 *
 * Normal installed users cannot write there and Windows returns EPERM.
 *
 * Inputs are provided through environment variables instead of argv so
 * the raw SQLCipher key does not appear in the process command line.
 *
 * Required environment variables:
 *
 *   RXPOS_PUSH_BACKEND_DIR
 *     Packaged backend root.
 *
 *   RXPOS_PUSH_DB_PATH
 *     Absolute writable SQLite database path.
 *
 *   RXPOS_PUSH_DB_KEY_HEX
 *     Derived SQLCipher key encoded as hexadecimal.
 */

const fs = require("node:fs");
const path = require("node:path");

function fail(message, err) {
  console.error(
    `[schema-push:err] ${message}`,
  );

  if (err) {
    console.error(
      err instanceof Error
        ? err.stack || err.message
        : err,
    );
  }

  process.exit(1);
}

function requireEnv(name) {
  const value = process.env[name];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `push-sqlite-schema-oneshot: ${name} is required`,
    );
  }

  return value.trim();
}

async function main() {
  let backendDir;
  let dbPath;
  let keyHex;

  try {
    backendDir = path.resolve(
      requireEnv("RXPOS_PUSH_BACKEND_DIR"),
    );

    dbPath = requireEnv(
      "RXPOS_PUSH_DB_PATH",
    );

    keyHex = requireEnv(
      "RXPOS_PUSH_DB_KEY_HEX",
    );
  } catch (err) {
    fail(
      "invalid or missing environment configuration",
      err,
    );

    return;
  }

  /*
   * ----------------------------------------------------------
   * VALIDATE DATABASE PATH
   * ----------------------------------------------------------
   */

  if (!path.isAbsolute(dbPath)) {
    fail(
      [
        "RXPOS_PUSH_DB_PATH must be an absolute path.",
        `Received: ${dbPath}`,
        `cwd: ${process.cwd()}`,
      ].join(" "),
    );

    return;
  }

  dbPath = path.normalize(dbPath);

  const dbDir = path.dirname(dbPath);

  /*
   * ----------------------------------------------------------
   * SECURITY: VALIDATE SQLCIPHER KEY
   * ----------------------------------------------------------
   */

  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    fail(
      "RXPOS_PUSH_DB_KEY_HEX must contain hexadecimal characters only",
    );

    return;
  }

  if (keyHex.length % 2 !== 0) {
    fail(
      "RXPOS_PUSH_DB_KEY_HEX has an invalid hexadecimal length",
    );

    return;
  }

  const dbKey = Buffer.from(
    keyHex,
    "hex",
  );

  if (dbKey.length !== 32) {
    fail(
      `RXPOS_PUSH_DB_KEY_HEX must decode to 32 bytes; received ${dbKey.length}`,
    );

    return;
  }

  /*
   * ----------------------------------------------------------
   * CREATE WRITABLE DATABASE DIRECTORY
   * ----------------------------------------------------------
   *
   * This directory should normally be:
   *
   * %APPDATA%
   *   \rx-pos-desktop
   *   \store-node
   *   \data
   *
   * Never Program Files.
   */

  try {
    fs.mkdirSync(
      dbDir,
      {
        recursive: true,
      },
    );
  } catch (err) {
    fail(
      `could not create SQLite data directory: ${dbDir}`,
      err,
    );

    return;
  }

  /*
   * ----------------------------------------------------------
   * CRITICAL FIX
   * ----------------------------------------------------------
   *
   * Set backend runtime configuration BEFORE require().
   *
   * dist/local/sqlite-push.js can transitively load:
   *
   *   config/database.js
   *
   * database.js may initialize Prisma immediately.
   *
   * Without LOCAL_DB_PATH here, backend config can fall back to:
   *
   *   ./data
   *
   * Since the schema-push cwd is the packaged backend directory,
   * that becomes:
   *
   *   C:\Program Files\RX POS\resources\backend\data
   *
   * and Windows returns EPERM.
   */

  process.env.DATA_BACKEND = "sqlite";

  process.env.LOCAL_DB_PATH = dbPath;

  /*
   * Keep the push-specific values normalized as well.
   */

  process.env.RXPOS_PUSH_BACKEND_DIR =
    backendDir;

  process.env.RXPOS_PUSH_DB_PATH =
    dbPath;

  /*
   * Do not log:
   *
   * RXPOS_PUSH_DB_KEY_HEX
   * LOCAL_DB_MASTER_KEY
   * JWT secrets
   * setup access code
   */

  console.log(
    `[schema-push] backendDir=${backendDir}`,
  );

  console.log(
    `[schema-push] dbPath=${dbPath}`,
  );

  console.log(
    `[schema-push] dbDir=${dbDir}`,
  );

  console.log(
    `[schema-push] dbPathAbsolute=${path.isAbsolute(dbPath)}`,
  );

  /*
   * ----------------------------------------------------------
   * LOAD BACKEND SCHEMA PUSH
   * ----------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This require MUST remain after:
   *
   *   process.env.DATA_BACKEND = "sqlite"
   *   process.env.LOCAL_DB_PATH = dbPath
   */

  const sqlitePushPath = path.join(
    backendDir,
    "dist",
    "local",
    "sqlite-push.js",
  );

  if (!fs.existsSync(sqlitePushPath)) {
    fail(
      [
        "pushSqliteSchema module does not exist.",
        `Expected: ${sqlitePushPath}`,
        "Was the backend built before desktop packaging?",
      ].join(" "),
    );

    return;
  }

  let pushSqliteSchema;

  try {
    const sqlitePushModule = require(
      sqlitePushPath,
    );

    pushSqliteSchema =
      sqlitePushModule.pushSqliteSchema;
  } catch (err) {
    fail(
      [
        "failed to load pushSqliteSchema from",
        sqlitePushPath,
        "Was the backend built before desktop packaging?",
      ].join(" "),
      err,
    );

    return;
  }

  if (
    typeof pushSqliteSchema !== "function"
  ) {
    fail(
      `pushSqliteSchema export was not found in ${sqlitePushPath}`,
    );

    return;
  }

  /*
   * ----------------------------------------------------------
   * PUSH SQLITE SCHEMA
   * ----------------------------------------------------------
   */

  try {
    await pushSqliteSchema({
      path: dbPath,
      key: dbKey,
    });

    console.log(
      "[schema-push] SQLite schema push completed successfully",
    );
  } catch (err) {
    fail(
      "pushSqliteSchema failed",
      err,
    );

    return;
  } finally {
    /*
     * Best-effort removal of key material from this script's references.
     *
     * Environment cleanup happens before normal process exit as well.
     */

    dbKey.fill(0);

    delete process.env
      .RXPOS_PUSH_DB_KEY_HEX;
  }

  process.exit(0);
}

void main();