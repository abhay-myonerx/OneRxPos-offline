import { contextBridge, ipcRenderer } from "electron";
import { buildBridgeStub } from "./bridge/stub";
import type { LicenseStatus } from "./bridge/contract";

const apiOrigin = process.env.RXPOS_API_ORIGIN ?? "http://localhost:4001";

const statusUrl = `${apiOrigin}/api/v2/license/status`;

const deviceFingerprint = process.env.RXPOS_DEVICE_FINGERPRINT ?? null;

const setupAccessCode = process.env.RXPOS_SETUP_ACCESS_CODE ?? null;

const appVersion = process.env.RXPOS_APP_VERSION ?? "0.0.0";

const isKiosk = process.env.RXPOS_KIOSK === "1";

/* -------------------------------------------------------------------------- */
/* CLOUD AUTH                                                                  */
/* -------------------------------------------------------------------------- */

type CloudRequestPayload = {
  url: string;

  method: string;

  headers?: Record<string, string>;

  body?: string;
};

contextBridge.exposeInMainWorld("rxPosCloudAuth", {
  request: (payload: CloudRequestPayload) =>
    ipcRenderer.invoke("cloud-auth:request", payload),
});

/* -------------------------------------------------------------------------- */
/* RX POS BRIDGE                                                               */
/* -------------------------------------------------------------------------- */

const bridge = buildBridgeStub({
  platform: process.platform,

  appVersion,

  isKiosk,

  apiOrigin,

  fetchStatus: async (): Promise<LicenseStatus> => {
    const response = await fetch(statusUrl);

    const json = (await response.json()) as {
      data: LicenseStatus;
    };

    return json.data;
  },

  getFingerprint: deviceFingerprint
    ? async () => deviceFingerprint
    : async () => "",

  setupAccessCode,
});


/* -------------------------------------------------------------------------- */
/* EXPOSE                                                                      */
/* -------------------------------------------------------------------------- */

contextBridge.exposeInMainWorld("rxpos", bridge);
