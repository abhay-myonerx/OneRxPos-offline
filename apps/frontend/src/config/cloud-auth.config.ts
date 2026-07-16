/**
 * RX POS → RXAdmin Auth V2 configuration.
 *
 * RX POS authenticates against RXAdmin using the
 * rx-connect platform.
 *
 * This configuration is used ONLY for cloud
 * authentication and device activation.
 *
 * Local POS authentication remains completely
 * independent.
 */

const DEFAULT_API_URL = "https://portal-api.myonerx.com/api";

const DEFAULT_PLATFORM = "rx-connect";

const DEFAULT_CLIENT_TYPE = "desktop";

const DEFAULT_ACCESS_TOKEN_EXPIRES = 15 * 60;

const ACCESS_TOKEN_REFRESH_SKEW = 60 * 1000;

function normalizeApiUrl(value?: string): string {
  const url = value?.trim() || DEFAULT_API_URL;

  return url.replace(/\/+$/, "");
}

export const cloudAuthConfig = {
  apiUrl: normalizeApiUrl(import.meta.env.VITE_RXADMIN_API_URL),

  platform: import.meta.env.VITE_RXADMIN_PLATFORM?.trim() || DEFAULT_PLATFORM,

  clientType: import.meta.env.VITE_RXADMIN_CLIENT_TYPE?.trim() || DEFAULT_CLIENT_TYPE,

  defaultAccessTokenExpiresInSeconds: DEFAULT_ACCESS_TOKEN_EXPIRES,

  accessTokenRefreshSkewMs: ACCESS_TOKEN_REFRESH_SKEW,
} as const;

export const CloudEndpoints = {
  LOGIN: "/v2/auth/login",

  REFRESH: "/v2/auth/refresh-token",

  REQUEST_OTP: "/v2/auth/otp/request",

  VERIFY_OTP: "/v2/auth/otp/verify",

  VERIFY_MFA: "/v2/auth/mfa/verify",

  MFA_RECOVERY: "/v2/auth/mfa/recovery",

  SELECT_PHARMACY: "/v2/auth/select-pharmacy",
} as const;

export function assertCloudAuthConfigured(): void {
  if (!cloudAuthConfig.apiUrl) {
    throw new Error("RXAdmin API URL is missing.");
  }

  if (!cloudAuthConfig.platform) {
    throw new Error("RXAdmin platform is missing.");
  }

  if (!cloudAuthConfig.clientType) {
    throw new Error("RXAdmin client type is missing.");
  }
}
