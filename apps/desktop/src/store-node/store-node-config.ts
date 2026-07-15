// Store-node local secrets.
//
// These values belong to the local RX POS installation only. They are generated
// on first boot and persisted under Electron's userData directory so every later
// boot reuses the same secrets.
//
// Device identity is intentionally NOT stored here. RX POS already has one
// authoritative device identity source in security/device-fingerprint.ts.
//
// The real device fingerprint is passed explicitly by main.ts to:
//   1. deriveStoreNodeDbKey()
//   2. startStoreNode()
//
// This guarantees SQLCipher and SYNC_DEVICE_ID use the exact same device ID.

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export interface StoreNodeSecrets {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  SYNC_TOKEN_SECRET: string;
  LICENSE_TOKEN_SECRET: string;
  PIN_PEPPER_SECRET: string;
  POS_OVERRIDE_SECRET: string;
  LOCAL_DB_MASTER_KEY: string;

  /**
   * The local backend's POST /api/v1/setup/complete endpoint requires this
   * value as a defense-in-depth setup gate.
   *
   * A Store Node has no separately configured server administrator, so the
   * desktop installation generates and persists this value locally.
   *
   * Never log this value.
   */
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

export const STORE_NODE_SECRETS_FILENAME = "store-node-secrets.json";

export function secretsFilePath(userDataDir: string): string {
  return path.join(userDataDir, STORE_NODE_SECRETS_FILENAME);
}

// 32 random bytes -> 64 hex characters.
//
// This is comfortably above the backend configuration minimums and gives every
// RX POS installation independent local secrets.
function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

function persist(
  userDataDir: string,
  secrets: StoreNodeSecrets,
): void {
  mkdirSync(userDataDir, {
    recursive: true,
  });

  const file = secretsFilePath(userDataDir);

  writeFileSync(
    file,
    JSON.stringify(secrets, null, 2),
    {
      mode: 0o600,
    },
  );

  // POSIX defense-in-depth. Windows does not interpret POSIX modes in exactly
  // the same way, but the file also lives in the OS-protected per-user
  // application data directory.
  try {
    chmodSync(file, 0o600);
  } catch {
    // Best-effort only.
  }
}

/**
 * Loads the Store Node's persisted local secrets.
 *
 * First boot:
 *   generates every secret and persists them.
 *
 * Existing installation:
 *   returns the same secrets unchanged.
 *
 * Older installation:
 *   backfills any newly introduced secret without rotating existing values.
 *
 * Important:
 *   device identity does NOT belong in this file. The existing
 *   security/device-fingerprint.ts implementation is the authoritative source
 *   for RX POS device identity.
 */
export function loadOrCreateStoreNodeSecrets(
  userDataDir: string,
): StoreNodeSecrets {
  const file = secretsFilePath(userDataDir);

  if (existsSync(file)) {
    const parsed = JSON.parse(
      readFileSync(file, "utf8"),
    ) as Partial<StoreNodeSecrets>;

    const missing = SECRET_KEYS.filter(
      (key) => !parsed[key],
    );

    if (missing.length === 0) {
      return parsed as StoreNodeSecrets;
    }

    const backfilled: StoreNodeSecrets = {
      JWT_ACCESS_SECRET:
        parsed.JWT_ACCESS_SECRET ?? generateSecret(),

      JWT_REFRESH_SECRET:
        parsed.JWT_REFRESH_SECRET ?? generateSecret(),

      SYNC_TOKEN_SECRET:
        parsed.SYNC_TOKEN_SECRET ?? generateSecret(),

      LICENSE_TOKEN_SECRET:
        parsed.LICENSE_TOKEN_SECRET ?? generateSecret(),

      PIN_PEPPER_SECRET:
        parsed.PIN_PEPPER_SECRET ?? generateSecret(),

      POS_OVERRIDE_SECRET:
        parsed.POS_OVERRIDE_SECRET ?? generateSecret(),

      LOCAL_DB_MASTER_KEY:
        parsed.LOCAL_DB_MASTER_KEY ?? generateSecret(),

      SETUP_ACCESS_CODE:
        parsed.SETUP_ACCESS_CODE ?? generateSecret(),
    };

    persist(userDataDir, backfilled);

    return backfilled;
  }

  const secrets: StoreNodeSecrets = {
    JWT_ACCESS_SECRET: generateSecret(),
    JWT_REFRESH_SECRET: generateSecret(),
    SYNC_TOKEN_SECRET: generateSecret(),
    LICENSE_TOKEN_SECRET: generateSecret(),
    PIN_PEPPER_SECRET: generateSecret(),
    POS_OVERRIDE_SECRET: generateSecret(),
    LOCAL_DB_MASTER_KEY: generateSecret(),
    SETUP_ACCESS_CODE: generateSecret(),
  };

  persist(userDataDir, secrets);

  return secrets;
}