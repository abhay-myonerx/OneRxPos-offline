/**
 * RX POS -> RXAdmin Auth V2 configuration.
 *
 * RX POS uses the RX Connect authentication platform.
 *
 * Cloud authentication:
 *
 * RX POS
 *   ↓
 * RXAdmin Auth V2
 *   ↓
 * platform = rx-connect
 * clientType = desktop
 *   ↓
 * Device approval / activation
 *   ↓
 * Offline local POS
 *
 * IMPORTANT:
 *
 * Cloud authentication is separate from the existing
 * local RX POS authentication.
 */

const DEFAULT_CLOUD_API_URL = "https://portal-api.myonerx.com/api";

const DEFAULT_PLATFORM = "rx-connect";

const DEFAULT_CLIENT_TYPE = "desktop";

const DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 15 * 60;

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60 * 1000;

function normalizeApiUrl(value: string | undefined): string {
  const url = value?.trim() || DEFAULT_CLOUD_API_URL;

  return url.replace(/\/+$/, "");
}

export const cloudAuthConfig = {
  apiUrl: normalizeApiUrl(import.meta.env.VITE_RXADMIN_API_URL),

  platform: import.meta.env.VITE_RXADMIN_PLATFORM?.trim() || DEFAULT_PLATFORM,

  clientType: import.meta.env.VITE_RXADMIN_CLIENT_TYPE?.trim() || DEFAULT_CLIENT_TYPE,

  defaultAccessTokenExpiresInSeconds: DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS,

  accessTokenRefreshSkewMs: ACCESS_TOKEN_REFRESH_SKEW_MS,
} as const;

export function assertCloudAuthConfigured(): void {
  if (!cloudAuthConfig.apiUrl) {
    throw new Error("RXAdmin API URL is not configured.");
  }

  if (!cloudAuthConfig.platform) {
    throw new Error("RXAdmin platform is not configured.");
  }

  if (!cloudAuthConfig.clientType) {
    throw new Error("RXAdmin client type is not configured.");
  }
}
