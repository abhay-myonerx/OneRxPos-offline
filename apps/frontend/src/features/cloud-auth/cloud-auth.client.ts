import { cloudAuthConfig, CloudEndpoints } from "../../config/cloud-auth.config";

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

/* -------------------------------------------------------------------------- */
/* NORMALIZE RESULT                                                            */
/* -------------------------------------------------------------------------- */

export function normalizeCloudAuthResult(data: PortalLoginResponseData): CloudAuthResult {
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

/* -------------------------------------------------------------------------- */
/* AUTHENTICATED                                                               */
/* -------------------------------------------------------------------------- */

function normalizeAuthenticatedSession(data: PortalLoginData): CloudAuthResult {
  if (!data.access_token || !data.refresh_token) {
    throw new CloudAuthApiError({
      message: "Invalid RXAdmin authentication response.",
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

/* -------------------------------------------------------------------------- */
/* LOGIN                                                                       */
/* -------------------------------------------------------------------------- */

export async function cloudLogin(payload: CloudLoginRequest): Promise<CloudAuthResult> {
  CloudTokenManager.clear();

  let deviceId = "";

  try {
    if (typeof window !== "undefined" && window.rxpos?.device?.getFingerprint) {
      deviceId = await window.rxpos.device.getFingerprint();
    }
  } catch (error) {
    console.warn("[RXADMIN] Failed to get device fingerprint.", error);
  }

  const requestBody = {
    email: payload.email.trim().toLowerCase(),

    password: payload.password,

    platform: cloudAuthConfig.platform,

    clientType: cloudAuthConfig.clientType,

    deviceId,
  };

  console.log("====================================");
  console.log("[RXADMIN LOGIN REQUEST]");
  console.log(requestBody);
  console.log("====================================");

  try {
    const response = await cloudRequest<PortalApiEnvelope<PortalLoginResponseData>>(
      CloudEndpoints.LOGIN,
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );

    console.log("====================================");
    console.log("[RXADMIN LOGIN RESPONSE]");
    console.log(response);
    console.log("====================================");

    return normalizeCloudAuthResult(unwrapCloudEnvelope(response));
  } catch (error) {
    CloudTokenManager.clear();

    console.error("====================================");
    console.error("[RXADMIN LOGIN ERROR]");
    console.error(error);
    console.error("====================================");

    if (error instanceof CloudAuthApiError) {
      throw new Error(error.message);
    }

    throw error;
  }
}
