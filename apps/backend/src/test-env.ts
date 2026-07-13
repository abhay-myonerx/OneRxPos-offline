// Vitest setupFile — runs once per worker before any test module
// loads. Stamps the env vars that `src/config/index.ts` parses at
// import time so tests don't need a real `.env` file present in
// the checkout. Production values never use these placeholders.
//
// Wired via `test.setupFiles` in `vitest.config.ts`. Per Phase 19b
// (encryption util) and Phase 19c (settings + moduleEnabled) the
// test surface needs DATABASE_URL + JWT secrets + MASTER_ENCRYPTION_KEY
// present at module load.

process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? "test-jwt-access-secret-".padEnd(64, "x");
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? "test-jwt-refresh-secret-".padEnd(64, "y");
// Master encryption key is per-test injected via
// `__setMasterKeyForTests` in `src/lib/encryption.ts`; setting it
// here too so non-encryption tests that happen to load the util
// don't blow up at import time.
process.env.MASTER_ENCRYPTION_KEY =
  process.env.MASTER_ENCRYPTION_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Store-node local encrypted DB + sync (Phase 0.4). Fixed test values so
// config parses without a real .env file present in the checkout.
process.env.LOCAL_DB_MASTER_KEY =
  process.env.LOCAL_DB_MASTER_KEY ??
  "test-local-db-master-key-0123456789abcdef0123456789abcdef01234567";
process.env.SYNC_TOKEN_SECRET =
  process.env.SYNC_TOKEN_SECRET ?? "test-sync-token-secret-change-me-0123456789";

// Phase 0.5 licensing — fixed test values so config parses without a real .env.
process.env.LICENSE_TOKEN_SECRET =
  process.env.LICENSE_TOKEN_SECRET ?? "test-license-token-secret-change-me-0123456789";

// Global rate limiter (src/middleware/rateLimiter.ts) keys by IP when no
// tenant is resolved yet — so EVERY route test shares one Redis counter
// (`rl:127.0.0.1:<window>`). Under the full suite, the aggregate authenticated
// request volume can exceed the production default (100/60s) within a single
// window and cascade spurious 429s across unrelated route tests (latent
// flakiness surfaced as more route suites were added). Raise the ceiling far
// out of reach for tests; no test asserts the 429 path.
process.env.RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX ?? "1000000";

// Phase 1.1 POS auth — fixed test values so config parses without a real .env.
process.env.PIN_PEPPER_SECRET =
  process.env.PIN_PEPPER_SECRET ?? "test-pin-pepper-secret-change-me-0123456789";
process.env.POS_OVERRIDE_SECRET =
  process.env.POS_OVERRIDE_SECRET ?? "test-pos-override-secret-change-me-0123456789";

// 3H.1 messaging — force the SendGrid env fallback OFF in tests. Hard-set (NOT
// `??`) so a real key in a developer's .env (loaded by config's dotenv.config()
// at import) can NEVER reach the drainer and send a real email during the suite,
// and so the fail-closed/null-path tests stay deterministic. Live smoke tests
// run OUTSIDE vitest via scripts/send-test-email.ts. Tests that need the fallback
// ON mutate `config.SENDGRID_*` directly and restore it.
process.env.SENDGRID_API_KEY = "";
process.env.SENDGRID_FROM_EMAIL = "test@example.com";

export {};
