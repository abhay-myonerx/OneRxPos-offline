import os from "node:os";

export type FingerprintSources = {
  hostname: string;
  mac: string;
  platform: string;
  cpu: string;
};

function firstPhysicalMac(): string {
  const interfaces = os.networkInterfaces();

  for (const list of Object.values(interfaces)) {
    for (const nic of list ?? []) {
      if (
        nic.internal ||
        !nic.mac ||
        nic.mac === "00:00:00:00:00:00"
      ) {
        continue;
      }

      return nic.mac;
    }
  }

  throw new Error("No physical MAC address found.");
}

export function gatherSources(): FingerprintSources {
  return {
    hostname: os.hostname() ?? "",
    mac: firstPhysicalMac(),
    platform: os.platform(),
    cpu: os.cpus()[0]?.model ?? "",
  };
}

/**
 * Convert:
 *   3c:52:82:18:ab:cd
 *
 * into:
 *   3C52-8218-ABCD
 *
 * If your RXAdmin specification truly requires
 * C71C-10B3-35BD-80DD, this produces the same style:
 *
 * XXXX-XXXX-XXXX
 * or XXXX-XXXX-XXXX-XXXX depending on the source length.
 */
function formatDeviceId(mac: string): string {
  const clean = mac
    .replace(/[^A-Fa-f0-9]/g, "")
    .toUpperCase();

  const groups: string[] = [];

  for (let i = 0; i < clean.length; i += 4) {
    groups.push(clean.substring(i, i + 4));
  }

  return groups.join("-");
}

export async function getDeviceFingerprint(): Promise<string> {
  const mac = firstPhysicalMac();

  return formatDeviceId(mac);
}