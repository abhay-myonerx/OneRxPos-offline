import {
  assertCloudAuthConfigured,
  cloudAuthConfig,
} from "../../config/cloud-auth.config";

import {
  CloudTokenManager,
} from "../../lib/cloud-auth/cloud-token-manager";

import type {
  PortalApiEnvelope,
} from "../../types/cloud-auth/cloud-auth.types";

type RefreshTokenData = {
  access_token: string;

  refresh_token?: string;

  expires_in: number;
};

let refreshInFlight:
  | Promise<string>
  | null = null;

function getErrorMessage(
  payload: unknown,
): string | null {
  if (
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const value =
    payload as Record<string, unknown>;

  if (
    typeof value.message === "string" &&
    value.message.trim()
  ) {
    return value.message;
  }

  if (
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error;
  }

  return null;
}

async function performRefresh():
  Promise<string> {
  assertCloudAuthConfigured();

  const refreshToken =
    CloudTokenManager.getRefreshToken();

  if (!refreshToken) {
    throw new Error(
      "Cloud refresh token is unavailable.",
    );
  }

  let response: Response;

  try {
    response = await fetch(
      `${cloudAuthConfig.apiUrl}/v2/auth/refresh-token`,
      {
        method: "POST",

        headers: {
          accept: "application/json",

          "content-type":
            "application/json",
        },

        body: JSON.stringify({
          refresh_token:
            refreshToken,
        }),
      },
    );
  } catch {
    /*
     * Network failure is NOT an offline POS
     * deactivation event.
     */
    throw new Error(
      "OneRx cloud is currently unavailable.",
    );
  }

  const payload =
    (await response.json()) as
      PortalApiEnvelope<RefreshTokenData>;

  if (
    !response.ok ||
    payload.success === false ||
    !payload.data?.access_token
  ) {
    throw new Error(
      getErrorMessage(payload) ??
        "Cloud session refresh failed.",
    );
  }

  CloudTokenManager.setTokens({
    accessToken:
      payload.data.access_token,

    refreshToken:
      payload.data.refresh_token,

    expiresInSeconds:
      payload.data.expires_in,
  });

  return payload.data.access_token;
}

export async function refreshCloudAccessToken():
  Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight =
      performRefresh().finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function getCloudAccessToken():
  Promise<string> {
  if (
    CloudTokenManager
      .isAccessTokenUsable()
  ) {
    const accessToken =
      CloudTokenManager
        .getAccessToken();

    if (accessToken) {
      return accessToken;
    }
  }

  return refreshCloudAccessToken();
}

export function clearCloudSession(): void {
  CloudTokenManager.clear();
}