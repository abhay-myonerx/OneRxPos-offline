"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "production", "test"]).default("development"),
    PORT: zod_1.z.coerce.number().default(3000),
    // Postgres connection string. Required only when DATA_BACKEND==="postgres"
    // (the default) — enforced in `src/config/database.ts` at client-creation
    // time rather than here, so a sqlite/store-node boot needs no Postgres URL
    // at all (see DATA_BACKEND below).
    DATABASE_URL: zod_1.z.string().url().optional(),
    REDIS_URL: zod_1.z.string().default("redis://localhost:6379"),
    // Store-node data backend switch. "postgres" (default) resolves the
    // existing cloud/shared Postgres client; "sqlite" resolves a keyed
    // SQLCipher client from prisma/schema.sqlite.prisma (see
    // `src/config/database.ts` + `src/local/sqlcipher-adapter.ts`).
    DATA_BACKEND: zod_1.z.enum(["postgres", "sqlite"]).default("postgres"),
    // Consumed directly by Prisma's schema loader for `prisma/schema.sqlite.prisma`
    // (datasource url = env("SQLITE_DATABASE_URL")); relative paths there resolve
    // against the schema file's directory (prisma/), NOT the process CWD. The
    // runtime resolver in `src/config/database.ts` uses `LOCAL_DB_PATH` instead
    // (a CWD-relative path) so both consumers stay unambiguous.
    SQLITE_DATABASE_URL: zod_1.z.string().default("file:./data/store-node.db"),
    JWT_ACCESS_SECRET: zod_1.z.string().min(32),
    JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    JWT_ACCESS_EXPIRY: zod_1.z.string().default("15m"),
    JWT_REFRESH_EXPIRY: zod_1.z.string().default("7d"),
    // Rotation: optional previous keys — verify accepts current + previous so a
    // secret can be rotated with zero downtime. Absent => single-key (as before).
    JWT_ACCESS_SECRET_PREVIOUS: zod_1.z.string().min(32).optional(),
    JWT_REFRESH_SECRET_PREVIOUS: zod_1.z.string().min(32).optional(),
    BCRYPT_ROUNDS: zod_1.z.coerce.number().default(12),
    RATE_LIMIT_MAX: zod_1.z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().default(60000),
    CORS_ORIGINS: zod_1.z.string().default("http://localhost:3000"),
    MASTER_ENCRYPTION_KEY: zod_1.z.string().optional(),
    // Store-node local encrypted DB (SQLCipher via better-sqlite3-multiple-ciphers)
    LOCAL_DB_PATH: zod_1.z.string().default("./data/store-node.db"),
    LOCAL_DB_MASTER_KEY: zod_1.z.string().optional(), // required at first local-DB use
    // Store-node <-> cloud sync
    SYNC_DEVICE_ID: zod_1.z.string().default("dev-device-0001"), // PLACEHOLDER — real fingerprint in Phase 0.5
    SYNC_TOKEN_SECRET: zod_1.z.string().min(32),
    SYNC_TOKEN_SECRET_PREVIOUS: zod_1.z.string().min(32).optional(),
    CLOUD_SYNC_URL: zod_1.z.string().default("http://localhost:4001/api/v2/sync"),
    // Store-node (SN-3) outbox-drainer target. Deliberately optional with NO
    // default (unlike CLOUD_SYNC_URL above, which is a different, pre-existing
    // sync channel): when unset, `drainOutbox` no-ops and the sync_outbox table
    // just accumulates rows — the store-node stays fully functional offline.
    // Boot wiring (reading this into the drainer's `deps.cloudUrl`) is SN-3
    // Task 3, not here.
    SYNC_CLOUD_URL: zod_1.z.string().url().optional(),
    // Store-node licensing + hardening (Phase 0.5)
    LICENSE_TOKEN_SECRET: zod_1.z.string().min(32), // signs/verifies the license lease; no default, fail-closed
    LICENSE_TOKEN_SECRET_PREVIOUS: zod_1.z.string().min(32).optional(),
    LICENSE_KEY: zod_1.z.string().optional(), // this till's activation key; absent -> unlicensed
    CLOUD_LICENSE_URL: zod_1.z.string().default("http://localhost:4001/api/v2/license"),
    LICENSE_DEGRADE_DAYS: zod_1.z.coerce.number().default(7),
    LICENSE_LOCKOUT_DAYS: zod_1.z.coerce.number().default(30),
    DEVICE_FINGERPRINT: zod_1.z.string().optional(), // override for CI/dev; else computed
    // POS auth (Phase 1.1)
    PIN_PEPPER_SECRET: zod_1.z.string().min(32), // peppers the 6-digit PIN before argon2; no default, fail-closed
    PIN_PEPPER_SECRET_PREVIOUS: zod_1.z.string().min(32).optional(),
    POS_OVERRIDE_SECRET: zod_1.z.string().min(32), // signs single-use override grants; no default, fail-closed
    POS_OVERRIDE_SECRET_PREVIOUS: zod_1.z.string().min(32).optional(),
    PIN_MAX_ATTEMPTS: zod_1.z.coerce.number().default(5),
    PIN_LOCKOUT_MINUTES: zod_1.z.coerce.number().default(15),
    // Outbound messaging (3H.1) — platform / store-node level SendGrid fallback.
    // Env-injected secret (same pattern as MASTER_ENCRYPTION_KEY): when a tenant
    // hasn't configured its own email in settings, the messaging layer falls back
    // to these. Per-tenant settings take precedence. Both must be set for the
    // fallback to activate; absent -> messaging stays disabled unless a tenant
    // configures it explicitly.
    SENDGRID_API_KEY: zod_1.z.string().optional(),
    SENDGRID_FROM_EMAIL: zod_1.z.string().email().optional(),
    // Parsed explicitly rather than with `z.coerce.boolean()`: coercion runs
    // Boolean(value), and Boolean("false") === true, so "DEMO_MODE=false"
    // would wrongly enable demo mode. Only the literal truthy strings below
    // turn it on; anything else (including "false", "0", "") keeps it off.
    DEMO_MODE: zod_1.z
        .string()
        .default("false")
        .transform((v) => ["true", "1", "yes", "on"].includes(v.trim().toLowerCase())),
});
exports.config = envSchema.parse(process.env);
//# sourceMappingURL=index.js.map