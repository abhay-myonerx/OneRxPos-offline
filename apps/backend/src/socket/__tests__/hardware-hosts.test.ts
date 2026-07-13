import { describe, it, expect, beforeEach } from "vitest";
import {
  registerHost,
  unregisterHost,
  getHost,
  clearAllHosts,
} from "../hardware-hosts";
import type { DeviceInfo } from "rx-pos-shared";

const devices: DeviceInfo[] = [
  {
    id: "d1",
    kind: "printer",
    label: "Front",
    transport: "native",
    ownerStationId: "st1",
    status: "connected",
  },
];

beforeEach(() => clearAllHosts());

describe("hardware-hosts registry", () => {
  it("registers and retrieves a host for a room", () => {
    registerHost("pos:t:s", "sock1", devices);
    expect(getHost("pos:t:s")).toEqual({ socketId: "sock1", devices });
  });

  it("returns undefined when no host is registered", () => {
    expect(getHost("pos:t:s")).toBeUndefined();
  });

  it("re-registering replaces the previous host", () => {
    registerHost("pos:t:s", "sock1", []);
    registerHost("pos:t:s", "sock2", []);
    expect(getHost("pos:t:s")?.socketId).toBe("sock2");
  });

  it("unregister only removes when the socket id matches (stale-safe)", () => {
    registerHost("pos:t:s", "sock1", []);
    unregisterHost("pos:t:s", "sockOTHER");
    expect(getHost("pos:t:s")?.socketId).toBe("sock1");
    unregisterHost("pos:t:s", "sock1");
    expect(getHost("pos:t:s")).toBeUndefined();
  });
});
