import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { exec as execCb } from "node:child_process";
import os from "node:os";
import { config } from "@/config";

const exec = promisify(execCb);

export type FingerprintSources = { cpu: string; disk: string; mac: string; board: string };

// Pure: normalize (trim + uppercase), join with a delimiter in a FIXED field
// order, SHA-256. Empty fields are allowed (graceful degradation).
export function resolveFingerprint(sources: FingerprintSources): string {
  const norm = (v: string) => v.trim().toUpperCase();
  const payload = ["cpu", "disk", "mac", "board"]
    .map((k) => `${k}=${norm(sources[k as keyof FingerprintSources])}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

async function tryExec(cmd: string): Promise<string> {
  try {
    const { stdout } = await exec(cmd, { timeout: 4000, windowsHide: true });
    return stdout;
  } catch {
    return "";
  }
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

// Best-effort per-platform hardware identifiers. Any failure -> "" (degrades).
export async function gatherSources(): Promise<FingerprintSources> {
  const cpu = os.cpus()[0]?.model ?? "";
  const mac = firstPhysicalMac();
  let disk = "";
  let board = "";
  if (process.platform === "win32") {
    disk = await tryExec("wmic diskdrive get serialnumber");
    board = await tryExec("wmic csproduct get uuid");
  } else if (process.platform === "darwin") {
    board = await tryExec("ioreg -rd1 -c IOPlatformExpertDevice");
    disk = await tryExec("system_profiler SPStorageDataType");
  } else {
    board = await tryExec("cat /sys/class/dmi/id/product_uuid");
    disk = await tryExec("lsblk -no serial");
  }
  return { cpu, disk, mac, board };
}

export async function getDeviceFingerprint(): Promise<string> {
  if (config.DEVICE_FINGERPRINT) return config.DEVICE_FINGERPRINT;
  return resolveFingerprint(await gatherSources());
}
