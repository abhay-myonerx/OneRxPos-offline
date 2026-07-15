import { cloudAuthConfig } from "../../config/cloud-auth.config";

import { CloudTokenManager } from "../../lib/cloud-auth/cloud-token-manager";

import {
  isPortalDeviceApprovalData,
  isPortalMfaRequiredData,
  isPortalPharmacySelectionData,
} from "../../types/cloud-auth/cloud-auth.types";

import type {
  CloudAuthResult,
  CloudLoginRequest,
  PortalApiEnvelope,
  PortalLoginData,
  PortalLoginResponseData,
} from "../../types/cloud-auth/cloud-auth.types";

import { CloudAuthApiError, cloudRequest, unwrapCloudEnvelope } from "./cloud-api.client";

// -----------------------------------------------------------------------------
// NORMALIZE AUTH RESULT
// -----------------------------------------------------------------------------

export function normalizeCloudAuthResult(data: PortalLoginResponseData): CloudAuthResult {
  /*
   * RXAdmin remains the source of truth for:
   *
   * - active account
   * - inactive account
   * - disabled account
   * - suspended account
   * - device approval
   *
   * RX POS must not invent a second account-status authority.
   */

  if (isPortalDeviceApprovalData(data)) {
    CloudTokenManager.clear();

    return {
      kind: "device_approval_pending",

      status: data.status,

      message: data.message,
    };
  }

  if (isPortalMfaRequiredData(data)) {
    CloudTokenManager.clear();

    return {
      kind: "mfa_required",

      method: data.mfa_method,

      challengeToken: data.challenge_token,
    };
  }

  if (isPortalPharmacySelectionData(data)) {
    CloudTokenManager.clear();

    return {
      kind: "pharmacy_selection_required",

      selectionToken: data.selection_token,

      pharmacies: data.pharmacies,
    };
  }

  return normalizeAuthenticatedSession(data);
}

// -----------------------------------------------------------------------------
// AUTHENTICATED SESSION
// -----------------------------------------------------------------------------

function normalizeAuthenticatedSession(data: PortalLoginData): CloudAuthResult {
  if (!data.access_token || !data.refresh_token || !data.email || !data.role || !data.pharmacyId) {
    throw new CloudAuthApiError({
      message: "OneRx cloud returned an invalid authentication response.",

      status: 500,

      payload: data,
    });
  }

  const expiresIn = data.expires_in ?? cloudAuthConfig.defaultAccessTokenExpiresInSeconds;

  CloudTokenManager.setTokens({
    accessToken: data.access_token,

    refreshToken: data.refresh_token,

    expiresInSeconds: expiresIn,
  });

  return {
    kind: "authenticated",

    accessToken: data.access_token,

    expiresAt: Date.now() + expiresIn * 1000,

    user: {
      email: data.email,

      role: data.role,

      userType: data.userType,

      pharmacyId: data.pharmacyId,

      pharmacyName: data.pharmacyName,

      licenseeFirstName: data.licenseeFirstName,

      licenseeLastName: data.licenseeLastName,

      licenseeEmail: data.licenseeEmail,

      mustChangePassword: data.mustChangePassword,

      canManageExtensions: data.canManageExtensions,

      canManagePhoneNumbers: data.canManagePhoneNumbers,

      canViewCallLogs: data.canViewCallLogs,
    },
  };
}

// -----------------------------------------------------------------------------
// AUTH ERROR
// -----------------------------------------------------------------------------

function normalizeCloudAuthError(error: unknown): never {
  if (error instanceof CloudAuthApiError) {
    if (
      error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 429
    ) {
      throw new Error(error.message);
    }
  }

  throw error;
}

// -----------------------------------------------------------------------------
// LOGIN
// -----------------------------------------------------------------------------

export async function cloudLogin(payload: CloudLoginRequest): Promise<CloudAuthResult> {
  CloudTokenManager.clear();

  try {
    const response = await cloudRequest<PortalApiEnvelope<PortalLoginResponseData>>(
      "/v2/auth/login",
      {
        method: "POST",

        body: JSON.stringify({
          email: payload.email.trim().toLowerCase(),

          password: payload.password,

          platform: cloudAuthConfig.platform,

          clientType: cloudAuthConfig.clientType,
        }),
      },
    );

    return normalizeCloudAuthResult(unwrapCloudEnvelope(response));
  } catch (error) {
    CloudTokenManager.clear();

    return normalizeCloudAuthError(error);
  }
}
