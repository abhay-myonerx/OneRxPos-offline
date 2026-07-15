import { CloudTokenManager } from "../../lib/cloud-auth/cloud-token-manager";

import type { PortalApiEnvelope } from "../../types/cloud-auth/cloud-auth.types";

import { cloudRequest, unwrapCloudEnvelope } from "./cloud-api.client";

type RefreshTokenData = {
  access_token: string;

  refresh_token?: string;

  expires_in: number;
};

let refreshInFlight: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refreshToken = CloudTokenManager.getRefreshToken();

  if (!refreshToken) {
    throw new Error("Cloud refresh token is unavailable.");
  }

  const response = await cloudRequest<PortalApiEnvelope<RefreshTokenData>>(
    "/v2/auth/refresh-token",
    {
      method: "POST",

      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    },
  );

  const data = unwrapCloudEnvelope(response);

  if (!data.access_token) {
    throw new Error("Cloud session refresh failed.");
  }

  CloudTokenManager.setTokens({
    accessToken: data.access_token,

    refreshToken: data.refresh_token,

    expiresInSeconds: data.expires_in,
  });

  return data.access_token;
}

export async function refreshCloudAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

export async function getCloudAccessToken(): Promise<string> {
  if (CloudTokenManager.isAccessTokenUsable()) {
    const accessToken = CloudTokenManager.getAccessToken();

    if (accessToken) {
      return accessToken;
    }
  }

  return refreshCloudAccessToken();
}

export function clearCloudSession(): void {
  CloudTokenManager.clear();
}
