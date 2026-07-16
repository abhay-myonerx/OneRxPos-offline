import { CloudEndpoints } from "../../config/cloud-auth.config";

import { CloudTokenManager } from "../../lib/cloud-auth/cloud-token-manager";

import type { PortalApiEnvelope } from "../../types/cloud-auth/cloud-auth.types";

import { cloudRequest, unwrapCloudEnvelope } from "./cloud-api.client";

type RefreshTokenData = {
  access_token: string;

  refresh_token?: string;

  expires_in: number;
};

let refreshPromise: Promise<string> | null = null;

/* -------------------------------------------------------------------------- */
/* REFRESH                                                                     */
/* -------------------------------------------------------------------------- */

async function performRefresh(): Promise<string> {
  const refreshToken = CloudTokenManager.getRefreshToken();

  if (!refreshToken) {
    throw new Error("Cloud refresh token is unavailable.");
  }

  console.log("[RXADMIN REFRESH] Starting refresh");

  const response = await cloudRequest<PortalApiEnvelope<RefreshTokenData>>(CloudEndpoints.REFRESH, {
    method: "POST",

    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  });

  const data = unwrapCloudEnvelope(response);

  if (!data.access_token) {
    CloudTokenManager.clear();

    throw new Error("Cloud refresh failed.");
  }

  CloudTokenManager.setTokens({
    accessToken: data.access_token,

    refreshToken: data.refresh_token ?? refreshToken,

    expiresInSeconds: data.expires_in,
  });

  console.log("[RXADMIN REFRESH] Success");

  return data.access_token;
}

/* -------------------------------------------------------------------------- */
/* PUBLIC                                                                      */
/* -------------------------------------------------------------------------- */

export async function refreshCloudAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function getCloudAccessToken(): Promise<string> {
  if (CloudTokenManager.isAccessTokenUsable()) {
    const token = CloudTokenManager.getAccessToken();

    if (token) {
      return token;
    }
  }

  return refreshCloudAccessToken();
}

export function clearCloudSession(): void {
  CloudTokenManager.clear();
}

export function hasCloudSession(): boolean {
  return CloudTokenManager.hasAccessToken() && CloudTokenManager.hasRefreshToken();
}
