import {
  cloudAuthConfig,
} from "../../config/cloud-auth.config";

import type {
  CloudAuthResult,
  CloudMfaRecoveryPayload,
  CloudMfaVerifyPayload,
  CloudOtpRequestPayload,
  CloudOtpRequestResult,
  CloudOtpVerifyPayload,
  CloudOtpVerifyResult,
  CloudSelectPharmacyPayload,
  PortalApiEnvelope,
  PortalLoginResponseData,
} from "../../types/cloud-auth/cloud-auth.types";

import {
  normalizeCloudAuthResult,
} from "./cloud-auth.client";

import {
  cloudRequest,
  unwrapCloudEnvelope,
} from "./cloud-api.client";

// -----------------------------------------------------------------------------
// OTP REQUEST
// -----------------------------------------------------------------------------

export async function requestCloudOtp(
  payload: CloudOtpRequestPayload,
): Promise<CloudOtpRequestResult> {
  const response = await cloudRequest<
    PortalApiEnvelope<CloudOtpRequestResult>
  >("/v2/auth/otp/request", {
    method: "POST",

    body: JSON.stringify({
      email:
        payload.email
          .trim()
          .toLowerCase(),

      platform:
        cloudAuthConfig.platform,

      clientType:
        cloudAuthConfig.clientType,
    }),
  });

  return unwrapCloudEnvelope(response);
}

// -----------------------------------------------------------------------------
// OTP VERIFY
// -----------------------------------------------------------------------------

export async function verifyCloudOtp(
  payload: CloudOtpVerifyPayload,
): Promise<CloudOtpVerifyResult> {
  const response = await cloudRequest<
    PortalApiEnvelope<CloudOtpVerifyResult>
  >("/v2/auth/otp/verify", {
    method: "POST",

    body: JSON.stringify({
      email:
        payload.email
          .trim()
          .toLowerCase(),

      code:
        payload.code.trim(),

      platform:
        cloudAuthConfig.platform,

      clientType:
        cloudAuthConfig.clientType,
    }),
  });

  return unwrapCloudEnvelope(response);
}

// -----------------------------------------------------------------------------
// MFA VERIFY
// -----------------------------------------------------------------------------

export async function verifyCloudMfa(
  payload: CloudMfaVerifyPayload,
): Promise<CloudAuthResult> {
  const response = await cloudRequest<
    PortalApiEnvelope<
      PortalLoginResponseData
    >
  >("/v2/auth/mfa/verify", {
    method: "POST",

    body: JSON.stringify({
      challenge_token:
        payload.challengeToken,

      code:
        payload.code.trim(),

      platform:
        cloudAuthConfig.platform,

      clientType:
        cloudAuthConfig.clientType,
    }),
  });

  return normalizeCloudAuthResult(
    unwrapCloudEnvelope(response),
  );
}

// -----------------------------------------------------------------------------
// MFA RECOVERY
// -----------------------------------------------------------------------------

export async function verifyCloudMfaRecovery(
  payload: CloudMfaRecoveryPayload,
): Promise<CloudAuthResult> {
  const response = await cloudRequest<
    PortalApiEnvelope<
      PortalLoginResponseData
    >
  >("/v2/auth/mfa/recovery", {
    method: "POST",

    body: JSON.stringify({
      challenge_token:
        payload.challengeToken,

      recovery_code:
        payload.recoveryCode.trim(),

      platform:
        cloudAuthConfig.platform,

      clientType:
        cloudAuthConfig.clientType,
    }),
  });

  return normalizeCloudAuthResult(
    unwrapCloudEnvelope(response),
  );
}

// -----------------------------------------------------------------------------
// PHARMACY SELECTION
// -----------------------------------------------------------------------------

export async function selectCloudPharmacy(
  payload: CloudSelectPharmacyPayload,
): Promise<CloudAuthResult> {
  const response = await cloudRequest<
    PortalApiEnvelope<
      PortalLoginResponseData
    >
  >("/v2/auth/select-pharmacy", {
    method: "POST",

    body: JSON.stringify({
      selection_token:
        payload.selectionToken,

      pharmacyId:
        payload.pharmacyId,

      platform:
        cloudAuthConfig.platform,

      clientType:
        cloudAuthConfig.clientType,
    }),
  });

  return normalizeCloudAuthResult(
    unwrapCloudEnvelope(response),
  );
}