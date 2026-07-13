import { expect, it } from "vitest";
import { buildBridgeStub } from "../../src/bridge/stub";

it("exposes hardware stubs and a fetch-backed license.getStatus", async () => {
  const b = buildBridgeStub({
    platform: "win32",
    appVersion: "0.1.0",
    isKiosk: true,
    fetchStatus: async () => ({ status: "active", plan: "standard", graceExpiresAt: 123 }),
  });
  expect(b.platform).toBe("win32");
  await expect(b.hardware.openCashDrawer()).resolves.toEqual({ ok: false, reason: "not-implemented" });
  await expect(b.license.getStatus()).resolves.toEqual({ status: "active", plan: "standard", graceExpiresAt: 123 });
});

it("device.getFingerprint falls back to a stable stub value when no provider is given", async () => {
  const b = buildBridgeStub({
    platform: "win32",
    appVersion: "0.1.0",
    isKiosk: true,
    fetchStatus: async () => ({ status: "active", plan: "standard", graceExpiresAt: 123 }),
  });
  const fp = await b.device.getFingerprint();
  expect(fp).toMatch(/^[0-9a-f]{64}$/);
  await expect(b.device.getFingerprint()).resolves.toBe(fp);
});

it("device.getFingerprint uses the provided getFingerprint option when given", async () => {
  const b = buildBridgeStub({
    platform: "win32",
    appVersion: "0.1.0",
    isKiosk: true,
    fetchStatus: async () => ({ status: "active", plan: "standard", graceExpiresAt: 123 }),
    getFingerprint: async () => "custom-fingerprint",
  });
  await expect(b.device.getFingerprint()).resolves.toBe("custom-fingerprint");
});

it("license.getStatus falls back to unlicensed when the fetch throws", async () => {
  const b = buildBridgeStub({
    platform: "win32",
    appVersion: "0.1.0",
    isKiosk: false,
    fetchStatus: async () => {
      throw new Error("backend down");
    },
  });
  await expect(b.license.getStatus()).resolves.toEqual({ status: "unlicensed", plan: null, graceExpiresAt: null });
});

// SN-5 OPS-1: setup.accessCode surfaces the store-node's generated
// SETUP_ACCESS_CODE to the renderer so the Setup wizard can auto-fill it.
it("setup.accessCode defaults to null when no setupAccessCode is supplied", () => {
  const b = buildBridgeStub({
    platform: "win32",
    appVersion: "0.1.0",
    isKiosk: false,
    fetchStatus: async () => ({ status: "unlicensed", plan: null, graceExpiresAt: null }),
  });
  expect(b.setup.accessCode).toBeNull();
});

it("setup.accessCode surfaces the supplied store-node access code", () => {
  const b = buildBridgeStub({
    platform: "win32",
    appVersion: "0.1.0",
    isKiosk: false,
    fetchStatus: async () => ({ status: "unlicensed", plan: null, graceExpiresAt: null }),
    setupAccessCode: "generated-secret-code",
  });
  expect(b.setup.accessCode).toBe("generated-secret-code");
});
