// In-memory registry of hardware-host stations, keyed by POS room
// ("pos:{tenantId}:{storeId}"). Single-node: correct for the local-first
// one-backend-per-store deployment. A Redis-backed registry for multi-node
// horizontal scale is a noted follow-up.

import type { DeviceInfo } from "rx-pos-shared";

export interface RegisteredHost {
  socketId: string;
  devices: DeviceInfo[];
}

const hosts = new Map<string, RegisteredHost>();

export function registerHost(room: string, socketId: string, devices: DeviceInfo[]): void {
  hosts.set(room, { socketId, devices });
}

/** Remove the host for a room, but only if `socketId` is still the registered
 *  one — so a reconnected host isn't wiped by a late disconnect of its old socket. */
export function unregisterHost(room: string, socketId: string): void {
  const existing = hosts.get(room);
  if (existing && existing.socketId === socketId) hosts.delete(room);
}

export function getHost(room: string): RegisteredHost | undefined {
  return hosts.get(room);
}

/** Test helper: reset the in-memory registry. */
export function clearAllHosts(): void {
  hosts.clear();
}
