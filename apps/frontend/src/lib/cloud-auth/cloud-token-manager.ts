import { cloudAuthConfig } from "../../config/cloud-auth.config";

type CloudTokenState = {
  accessToken: string | null;

  refreshToken: string | null;

  expiresAt: number | null;
};

const state: CloudTokenState = {
  accessToken: null,

  refreshToken: null,

  expiresAt: null,
};

function normalizeExpiry(expiresInSeconds?: number): number {
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
  }) {
    const expiresIn = normalizeExpiry(params.expiresInSeconds);

    state.accessToken = params.accessToken;

    if (params.refreshToken !== undefined) {
      state.refreshToken = params.refreshToken;
    }

    state.expiresAt = Date.now() + expiresIn * 1000;
  },

  getAccessToken() {
    return state.accessToken;
  },

  getRefreshToken() {
    return state.refreshToken;
  },

  getExpiresAt() {
    return state.expiresAt;
  },

  hasAccessToken() {
    return Boolean(state.accessToken);
  },

  hasRefreshToken() {
    return Boolean(state.refreshToken);
  },

  isExpired() {
    if (!state.expiresAt) {
      return true;
    }

    return Date.now() >= state.expiresAt;
  },

  shouldRefresh() {
    if (!state.expiresAt) {
      return true;
    }

    return Date.now() >= state.expiresAt - cloudAuthConfig.accessTokenRefreshSkewMs;
  },

  isAccessTokenUsable() {
    return this.hasAccessToken() && !this.shouldRefresh();
  },

  clear() {
    state.accessToken = null;

    state.refreshToken = null;

    state.expiresAt = null;
  },
};
