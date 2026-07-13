// Store-node licensing daily re-validation job. Wakes up on a BullMQ tick
// (or the immediate kick queued by server.ts on boot), re-validates this
// till's license key against the cloud, and persists the refreshed lease.
// See LicenseJobData in ../config/queue.ts — the payload carries no data
// to act on; the processor rebuilds the license client from config/db
// itself (mirrors sync.processor.ts).

import { config } from "../config";
import { runLicenseValidation } from "./license.processor";
import { createLicenseClient } from "@/licensing/license-client";
import { readLicenseStatus } from "@/licensing/status";
import { getLocalDb } from "@/local/database";
import { deriveLocalDbKey } from "@/local/key-derivation";
import { getDeviceFingerprint } from "@/licensing/fingerprint";

export async function processLicenseValidate(): Promise<void> {
  // No license key configured means this till isn't activated — nothing
  // to re-validate.
  if (!config.LICENSE_KEY) return;

  const db = getLocalDb();
  const key = deriveLocalDbKey(config.LOCAL_DB_MASTER_KEY!, config.SYNC_DEVICE_ID);
  const fingerprint = await getDeviceFingerprint();

  const http = async (url: string, body: unknown) => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as { lease?: string } };
  };

  const client = createLicenseClient({
    db,
    key,
    http,
    cloudUrl: config.CLOUD_LICENSE_URL,
    licenseKey: config.LICENSE_KEY,
    fingerprint,
  });

  await runLicenseValidation({
    validate: (now) => client.validate(now),
    readStatus: () =>
      readLicenseStatus(db, key, {
        hasKey: true,
        now: Date.now(),
        degradeDays: config.LICENSE_DEGRADE_DAYS,
        lockoutDays: config.LICENSE_LOCKOUT_DAYS,
        fingerprint,
      }),
    now: Date.now(),
  });
}
