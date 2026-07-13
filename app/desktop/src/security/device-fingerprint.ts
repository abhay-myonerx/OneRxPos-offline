// src/security/device-fingerprint.ts
import { createHash } from "node:crypto";
import os from "node:os";

export type FingerprintSources = { hostname: string; mac: string; platform: string; cpu: string };

// Pure: normalize (trim + uppercase), join with a delimiter in a FIXED field
// order, SHA-256. Mirrors the backend's resolveFingerprint shape (0.5
// src/licensing/fingerprint.ts) but is this desktop package's own copy —
// each Electron lane computes its own identity from its own OS.
export function computeFingerprint(sources: FingerprintSources): string {
  const norm = (v: string) => v.trim().toUpperCase();
  const payload = ["hostname", "mac", "platform", "cpu"]
    .map((k) => `${k}=${norm(sources[k as keyof FingerprintSources])}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function firstPhysicalMac(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] ?? []) {
      if (!ni.internal && ni.mac && ni.mac !== "00:00:00:00:00:00") return ni.mac;
    }
  }
  return "";
}

// Best-effort OS identifiers for this lane. Any missing value degrades to "".
export function gatherSources(): FingerprintSources {
  return {
    hostname: os.hostname() ?? "",
    mac: firstPhysicalMac(),
    platform: os.platform(),
    cpu: os.cpus()[0]?.model ?? "",
  };
}

export async function getDeviceFingerprint(): Promise<string> {
  return computeFingerprint(gatherSources());
}
