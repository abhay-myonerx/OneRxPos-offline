import { cloudAuthConfig } from "../../config/cloud-auth.config";

type CloudTokenState = {
  accessToken: string | null;

  refreshToken: string | null;

  expiresAt: number | null;
};

/**
 * RXAdmin cloud tokens.
 *
 * These tokens are intentionally memory-only.
 *
 * Never persist them to:
 *
 * - localStorage
 * - sessionStorage
 * - IndexedDB
 * - Redux persisted state
 *
 * Cloud authentication is used for POS activation.
 */
const state: CloudTokenState = {
  accessToken: null,

  refreshToken: null,

  expiresAt: null,
};

function normalizeExpiresIn(
  expiresInSeconds?: number,
): number {
  if (
    typeof expiresInSeconds !== "number" ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds <= 0
  ) {
    return cloudAuthConfig.defaultAccessTokenExpiresInSeconds;
  }

  return expiresInSeconds;
}

export const CloudTokenManager = {
  setTokens(params: {
    accessToken: string;

    refreshToken?: string | null;

    expiresInSeconds?: number;
  }): void {
    const expiresInSeconds = normalizeExpiresIn(
      params.expiresInSeconds,
    );

    state.accessToken = params.accessToken;

    if (params.refreshToken !== undefined) {
      state.refreshToken = params.refreshToken;
    }

    state.expiresAt =
      Date.now() +
      expiresInSeconds * 1000;
  },

  setAccessToken(params: {
    accessToken: string;

    expiresInSeconds?: number;
  }): void {
    const expiresInSeconds = normalizeExpiresIn(
      params.expiresInSeconds,
    );

    state.accessToken = params.accessToken;

    state.expiresAt =
      Date.now() +
      expiresInSeconds * 1000;
  },

  getAccessToken(): string | null {
    return state.accessToken;
  },

  getRefreshToken(): string | null {
    return state.refreshToken;
  },

  getExpiresAt(): number | null {
    return state.expiresAt;
  },

  hasAccessToken(): boolean {
    return Boolean(state.accessToken);
  },

  hasRefreshToken(): boolean {
    return Boolean(state.refreshToken);
  },

  isAccessTokenUsable(): boolean {
    if (
      !state.accessToken ||
      !state.expiresAt
    ) {
      return false;
    }

    return (
      Date.now() <
      state.expiresAt -
        cloudAuthConfig.accessTokenRefreshSkewMs
    );
  },

  clear(): void {
    state.accessToken = null;

    state.refreshToken = null;

    state.expiresAt = null;
  },
};