/**
 * RX POS -> RXAdmin cloud authentication configuration.
 *
 * Authentication flow:
 *
 * RX POS
 *   ↓
 * RXAdmin Auth V2
 *   ↓
 * platform = rx-connect
 * clientType = desktop
 *   ↓
 * One-time POS activation / approval
 *   ↓
 * Local offline POS
 *
 * IMPORTANT:
 *
 * RXAdmin cloud authentication is separate from the
 * existing RX POS local Store Node authentication.
 *
 * Cloud tokens must never replace local POS JWT tokens.
 */

// -----------------------------------------------------------------------------
// ENVIRONMENT CONFIGURATION
// -----------------------------------------------------------------------------

const configuredApiUrl = import.meta.env.VITE_RXADMIN_API_URL?.trim();

const configuredPlatform = import.meta.env.VITE_RXADMIN_PLATFORM?.trim();

const configuredClientType = import.meta.env.VITE_RXADMIN_CLIENT_TYPE?.trim();

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

function normalizeApiUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

// -----------------------------------------------------------------------------
// CLOUD AUTH CONFIG
// -----------------------------------------------------------------------------

export const cloudAuthConfig = {
  /**
   * RXAdmin API root.
   *
   * Login endpoint:
   *
   * POST
   * https://portal-api.myonerx.com/v2/auth/login
   */
  apiUrl: normalizeApiUrl(configuredApiUrl || "https://portal-api.myonerx.com"),

  /**
   * OneRx platform.
   *
   * IMPORTANT:
   *
   * RX POS currently uses the RX Connect platform
   * authentication / approval flow.
   */
  platform: configuredPlatform || "rx-connect",

  /**
   * RX POS runs as an Electron desktop application.
   *
   * This is NOT the platform.
   *
   * platform   = rx-connect
   * clientType = desktop
   */
  clientType: configuredClientType || "desktop",

  /**
   * Default RXAdmin access token expiry.
   *
   * RXAdmin `expires_in` remains the source of truth.
   *
   * Fallback:
   * 15 minutes.
   */
  defaultAccessTokenExpiresInSeconds: 15 * 60,

  /**
   * Refresh the RXAdmin access token before expiry.
   *
   * 60 seconds before actual expiry.
   */
  accessTokenRefreshSkewMs: 60 * 1000,
} as const;

// -----------------------------------------------------------------------------
// CONFIGURATION VALIDATION
// -----------------------------------------------------------------------------

export function assertCloudAuthConfigured(): void {
  if (!cloudAuthConfig.apiUrl) {
    throw new Error("RXAdmin cloud API URL is not configured.");
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(cloudAuthConfig.apiUrl);
  } catch {
    throw new Error("RXAdmin cloud API URL is invalid.");
  }

  const isHttps = parsedUrl.protocol === "https:";

  const isLocalhost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";

  if (!isHttps && !isLocalhost) {
    throw new Error("RXAdmin cloud API must use HTTPS.");
  }

  if (cloudAuthConfig.platform !== "rx-connect") {
    throw new Error('RX POS cloud platform must be "rx-connect".');
  }

  if (cloudAuthConfig.clientType !== "desktop") {
    throw new Error('RX POS cloud client type must be "desktop".');
  }
}
