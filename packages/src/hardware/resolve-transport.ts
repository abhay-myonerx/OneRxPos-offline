import type { DeviceProfile, Transport } from "./hal.types";

export interface HardwareRuntime {
  platform: "electron" | "web";
  /** This client's station id (Electron stations only; null for web). */
  stationId: string | null;
  /** Whether a hardware-host station is online for this store. */
  hostOnline: boolean;
}

/** Thrown when no transport can reach a device from the current runtime. */
export class NoRouteError extends Error {
  constructor(public readonly deviceId: string) {
    super(`No route to device ${deviceId}`);
    this.name = "NoRouteError";
  }
}

/**
 * Decide which transport reaches `profile` from `runtime`, or throw NoRouteError.
 * - network connection → NETWORK (every platform, including iPad)
 * - usb/serial on the owning Electron station → NATIVE
 * - usb/serial from a thin client (or non-owner) with a host online → RELAY
 * - otherwise → NoRouteError (fail-closed)
 */
export function resolveTransport(
  profile: DeviceProfile,
  runtime: HardwareRuntime,
): Transport {
  if (profile.connection.kind === "network") return "network";

  const ownsDevice =
    runtime.platform === "electron" &&
    profile.ownerStationId !== null &&
    runtime.stationId === profile.ownerStationId;
  if (ownsDevice) return "native";

  if (runtime.hostOnline) return "relay";

  throw new NoRouteError(profile.id);
}
