"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openLocalDb = openLocalDb;
exports.getLocalDb = getLocalDb;
exports.closeLocalDb = closeLocalDb;
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
const better_sqlite3_multiple_ciphers_1 = __importDefault(require("better-sqlite3-multiple-ciphers"));
const config_1 = require("@/config");
const key_derivation_1 = require("./key-derivation");
// Open a SQLCipher-encrypted DB with a raw 32-byte key + WAL. Pure of config
// so it is unit-testable with a temp file.
function openLocalDb(opts) {
    if (opts.path !== ":memory:")
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(opts.path), { recursive: true });
    const db = new better_sqlite3_multiple_ciphers_1.default(opts.path);
    try {
        db.pragma("cipher='sqlcipher'");
        db.pragma(`key="x'${(0, key_derivation_1.keyToHex)(opts.key)}'"`);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        return db;
    }
    catch (err) {
        // A wrong key surfaces here (e.g. on the journal_mode pragma) rather than
        // on first query. Close now so the native handle isn't leaked open —
        // otherwise callers/tests that never see a usable db can't clean up the
        // file (Windows in particular locks it until the handle is closed).
        db.close();
        throw err;
    }
}
// globalThis singleton (mirrors config/database.ts) built from config.
const g = globalThis;
function getLocalDb() {
    if (g.__rxposLocalDb)
        return g.__rxposLocalDb;
    if (!config_1.config.LOCAL_DB_MASTER_KEY)
        throw new Error("LOCAL_DB_MASTER_KEY is required for the local DB");
    const key = (0, key_derivation_1.deriveLocalDbKey)(config_1.config.LOCAL_DB_MASTER_KEY, config_1.config.SYNC_DEVICE_ID);
    g.__rxposLocalDb = openLocalDb({ path: config_1.config.LOCAL_DB_PATH, key });
    return g.__rxposLocalDb;
}
function closeLocalDb() {
    g.__rxposLocalDb?.close();
    g.__rxposLocalDb = undefined;
}
//# sourceMappingURL=database.js.map