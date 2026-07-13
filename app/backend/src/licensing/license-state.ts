import type { LocalDatabase } from "@/local/database";
import { encryptEvent, decryptEvent } from "@/local/event-crypto";

export type PersistedLicenseState = { lease: string; lastValidatedAt: number };

// Single-row (id=1) table. The lease is a signed JWT but we still encrypt it at
// rest with the 0.4 local-DB crypto so the SQLCipher file never holds a
// readable lease token even if the page cache leaks.
export function saveLicenseState(db: LocalDatabase, key: Buffer, state: PersistedLicenseState): void {
  const enc = encryptEvent(state.lease, key);
  db.prepare(
    `INSERT INTO license_state (id, lease, lastValidatedAt) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET lease = excluded.lease, lastValidatedAt = excluded.lastValidatedAt`,
  ).run(enc, state.lastValidatedAt);
}

export function readLicenseState(db: LocalDatabase, key: Buffer): PersistedLicenseState | null {
  const row = db.prepare("SELECT lease, lastValidatedAt FROM license_state WHERE id = 1").get() as
    | { lease: string; lastValidatedAt: number }
    | undefined;
  if (!row) return null;
  return { lease: decryptEvent(row.lease, key), lastValidatedAt: row.lastValidatedAt };
}
