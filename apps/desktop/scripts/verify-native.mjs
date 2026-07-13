// Load proof for SN-4 Task 1: proves better-sqlite3-multiple-ciphers' Electron
// abi-146 prebuild actually loads and does real SQLCipher encryption when run
// under Electron-as-node (ELECTRON_RUN_AS_NODE=1 <electron.exe> scripts/verify-native.mjs).
//
// Mirrors the pragma order used by the real backend (rx-pos-backend/src/local/database.ts):
//   cipher='sqlcipher' -> key -> journal_mode=WAL -> foreign_keys=ON
//
// Exits 1 (loudly) on any failure so `npm run verify:native` can gate CI/dev setup.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";

function fail(message, err) {
  console.error(`FAIL: ${message}`);
  if (err) console.error(err);
  process.exitCode = 1;
}

let tmpDir;
try {
  console.log(`Node ABI (process.versions.modules): ${process.versions.modules}`);
  console.log(`ELECTRON_RUN_AS_NODE: ${process.env.ELECTRON_RUN_AS_NODE ?? "(unset)"}`);
  if (process.versions.electron) {
    console.log(`Running under Electron: ${process.versions.electron}`);
  }

  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3-multiple-ciphers"));
    console.log("PASS: require('better-sqlite3-multiple-ciphers') loaded the native module");
  } catch (err) {
    fail("require('better-sqlite3-multiple-ciphers') threw — native module did not load", err);
    process.exit(1);
  }

  tmpDir = mkdtempSync(path.join(tmpdir(), "rxpos-verify-native-"));
  const dbPath = path.join(tmpDir, "verify.db");
  const keyHex = crypto.randomBytes(32).toString("hex"); // any 32-byte hex key

  // --- Open, encrypt, write, read back ---
  let db;
  try {
    db = new Database(dbPath);
    db.pragma("cipher='sqlcipher'");
    db.pragma(`key="x'${keyHex}'"`);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    console.log("PASS: opened DB + applied cipher/key/WAL/foreign_keys pragmas");
  } catch (err) {
    db?.close();
    fail("failed to open + configure the encrypted DB", err);
    process.exit(1);
  }

  try {
    db.exec("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run(1, "hello-sqlcipher");
    const row = db.prepare("SELECT v FROM t WHERE id = ?").get(1);
    if (row?.v !== "hello-sqlcipher") {
      throw new Error(`round-trip mismatch: got ${JSON.stringify(row)}`);
    }
    console.log("PASS: create table + insert + select round-tripped correctly");
  } catch (err) {
    fail("read/write round-trip through the encrypted DB failed", err);
    db.close();
    process.exit(1);
  }

  db.close();

  // --- Reopen WITHOUT the key: must fail (proves it's genuinely encrypted) ---
  let reopenThrew = false;
  let noKeyDb;
  try {
    noKeyDb = new Database(dbPath);
    noKeyDb.pragma("journal_mode = WAL"); // any real query against the encrypted pages should throw
    noKeyDb.prepare("SELECT * FROM t").get();
  } catch {
    reopenThrew = true;
  } finally {
    try {
      noKeyDb?.close();
    } catch {
      // ignore — handle may already be invalid
    }
  }

  if (reopenThrew) {
    console.log("PASS: reopening the DB file without the key threw (data is genuinely encrypted)");
  } else {
    fail("reopening the DB file without the key did NOT throw — data does not appear encrypted");
  }
} catch (err) {
  fail("unexpected error during verification", err);
} finally {
  if (tmpDir) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch (err) {
      console.error("warning: failed to clean up temp dir", err);
    }
  }
}

if (process.exitCode) {
  console.error("\nverify-native: FAILED");
  process.exit(process.exitCode);
} else {
  console.log("\nverify-native: ALL CHECKS PASSED");
}
