// Store-node self-sufficiency (SN-4 Task 2): the spawned backend REQUIRES a
// set of ≥32-char secrets (rx-pos-backend/src/config/index.ts — JWT access/
// refresh, sync token, license token, PIN pepper, POS override) plus a
// LOCAL_DB_MASTER_KEY to derive the SQLCipher key for the encrypted local DB
// (src/local/key-derivation.ts: deriveLocalDbKey(masterKey, deviceId)).
//
// A store-node has no cloud to issue these, so on first boot we generate them
// locally and persist them to disk; every later boot reads the same values
// back. Losing this file just means a fresh (empty) encrypted DB on next
// boot — it never blocks the app from starting, and it is never sent
// anywhere (no cloud round-trip).
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface StoreNodeSecrets {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SYNC_TOKEN_SECRET: string;
  LICENSE_TOKEN_SECRET: string;
  PIN_PEPPER_SECRET: string;
  POS_OVERRIDE_SECRET: string;
  LOCAL_DB_MASTER_KEY: string;
  // SN-4 Task 3: the backend's POST /api/v1/setup/complete refuses to run
  // unless SETUP_ACCESS_CODE is set in its env (rx-pos-backend/src/modules/
  // setup/setup.service.ts) — that's its defense-in-depth gate against a
  // stranger hitting a cloud deployment's setup endpoint. A store-node has no
  // "server administrator" to configure that separately; it IS the device the
  // operator is standing at. So we generate + persist it exactly like every
  // other local secret, and the existing Setup wizard (reused as-is, no new
  // onboarding UI) is the thing that must surface it to the operator.
  SETUP_ACCESS_CODE: string;
}

const SECRET_KEYS: (keyof StoreNodeSecrets)[] = [
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SYNC_TOKEN_SECRET",
  "LICENSE_TOKEN_SECRET",
  "PIN_PEPPER_SECRET",
  "POS_OVERRIDE_SECRET",
  "LOCAL_DB_MASTER_KEY",
  "SETUP_ACCESS_CODE",
];

// SN-4 Task 3: fixed local device id used both (a) here so onboarding derives
// the SAME SQLCipher key the server will open the DB with, and (b)
// explicitly passed as SYNC_DEVICE_ID to the spawned server (launcher.ts) so
// it doesn't merely happen to match the backend's zod-schema default —
// see rx-pos-backend/src/config/index.ts's own comment: "PLACEHOLDER — real
// fingerprint in Phase 0.5". Replace both usages together when that lands.
export const STORE_NODE_DEVICE_ID = "dev-device-0001";

export const STORE_NODE_SECRETS_FILENAME = "store-node-secrets.json";

export function secretsFilePath(userDataDir: string): string {
  return path.join(userDataDir, STORE_NODE_SECRETS_FILENAME);
}

// 32 raw random bytes -> 64 hex chars: comfortably over every `.min(32)`
// (characters, not bytes) check in the backend's env schema either way.
function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

function persist(userDataDir: string, secrets: StoreNodeSecrets): void {
  mkdirSync(userDataDir, { recursive: true });
  const file = secretsFilePath(userDataDir);
  // mode: 0o600 restricts read/write to the owner. writeFileSync applies it
  // at creation time; chmodSync re-asserts it on overwrite (backfill path
  // below), best-effort since Windows ACLs don't honor POSIX modes the same
  // way — this is a defense-in-depth layer, not the only protection (the
  // file also just lives under the OS-protected per-user app-data dir).
  writeFileSync(file, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort only
  }
}

// Idempotent: first call generates + persists every secret; every later call
// (this run, or a future launch) reads the same values back unchanged.
export function loadOrCreateStoreNodeSecrets(userDataDir: string): StoreNodeSecrets {
  const file = secretsFilePath(userDataDir);

  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<StoreNodeSecrets>;
    const missing = SECRET_KEYS.filter((key) => !parsed[key]);
    if (missing.length === 0) return parsed as StoreNodeSecrets;

    // Backfill any keys missing from an older secrets file (e.g. a new
    // secret was added since this store-node last ran) instead of failing.
    const filled = { ...parsed } as StoreNodeSecrets;
    for (const key of missing) filled[key] = generateSecret();
    persist(userDataDir, filled);
    return filled;
  }

  const secrets = Object.fromEntries(
    SECRET_KEYS.map((key) => [key, generateSecret()]),
  ) as unknown as StoreNodeSecrets;
  persist(userDataDir, secrets);
  return secrets;
}
