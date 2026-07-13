// RTK Query slice for `/api/v2/pos/*` — device enrollment, PIN quick-login,
// PIN set, and the inline-PIN manager override (Phase 1.1, Task 11).
//
// pos-auth is mounted a version ahead of the default `env.apiUrl` (v1), so
// (mirroring `features/hr/api/hr-base-url.ts`'s `HR_V2_ROOT`) we compute an
// absolute v2 root here rather than relying on `baseApi`'s baseUrl.
// `fetchBaseQuery` uses a URL as-is (skipping baseUrl-joining) whenever it's
// absolute, which is what makes this work.

import { baseApi } from "@/store/base-api";
import { env } from "@/shell/env";
import type { ApiResponse } from "@/types/common/api-response.types";
import type {
  EnrollDeviceRequest,
  EnrolledDevice,
  PinLoginRequest,
  PinLoginResponse,
  SetPinRequest,
  SetPinResponse,
  RequestOverrideRequest,
  RequestOverrideResponse,
} from "../types/pos-auth.types";

const POS_V2_ROOT = env.apiUrl.replace(/\/api\/v\d+\/?$/, "/api") + "/v2/pos";

const url = (path = "") => `${POS_V2_ROOT}${path}`;

export const posAuthApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    enrollDevice: build.mutation<EnrolledDevice, EnrollDeviceRequest>({
      query: (body) => ({ url: url("/enroll"), method: "POST", body }),
      transformResponse: (res: ApiResponse<EnrolledDevice>) => res.data,
    }),
    pinLogin: build.mutation<PinLoginResponse, PinLoginRequest>({
      query: (body) => ({ url: url("/pin-login"), method: "POST", body }),
      transformResponse: (res: ApiResponse<PinLoginResponse>) => res.data,
    }),
    setPin: build.mutation<SetPinResponse, SetPinRequest>({
      query: (body) => ({ url: url("/pin"), method: "POST", body }),
      transformResponse: (res: ApiResponse<SetPinResponse>) => res.data,
    }),
    requestOverride: build.mutation<RequestOverrideResponse, RequestOverrideRequest>({
      query: (body) => ({ url: url("/override"), method: "POST", body }),
      transformResponse: (res: ApiResponse<RequestOverrideResponse>) => res.data,
    }),
  }),
});

export const {
  useEnrollDeviceMutation,
  usePinLoginMutation,
  useSetPinMutation,
  useRequestOverrideMutation,
} = posAuthApi;

const DEV_FINGERPRINT_KEY = "rxpos.dev.fingerprint";

/**
 * Resolve this lane's device fingerprint. On the Electron shell,
 * `window.rxpos.device.getFingerprint()` (the desktop bridge) provides a
 * real, stable hardware-derived fingerprint. In a browser tab / PWA / dev
 * session there is no bridge, so we fall back to a uuid persisted in
 * localStorage — generated once and reused, so the "lane" stays stable
 * across reloads within that browser profile.
 */
export async function getLaneFingerprint(): Promise<string> {
  const bridgeFingerprint = await window.rxpos?.device?.getFingerprint?.();
  if (bridgeFingerprint) return bridgeFingerprint;

  const existing = localStorage.getItem(DEV_FINGERPRINT_KEY);
  if (existing) return existing;

  const generated = crypto.randomUUID();
  localStorage.setItem(DEV_FINGERPRINT_KEY, generated);
  return generated;
}
