/**
 * RX POS cloud authentication contracts.
 *
 * Mirrors RXAdmin auth-v2 / rx-connect authentication.
 *
 * Cloud authentication is used only for initial POS activation.
 * It is separate from RX POS local authentication.
 */

// -----------------------------------------------------------------------------
// REQUEST PAYLOADS
// -----------------------------------------------------------------------------

export interface CloudLoginRequest {
  email: string;
  password: string;
}

export interface CloudOtpRequestPayload {
  email: string;
}

export interface CloudOtpVerifyPayload {
  email: string;
  code: string;
}

export interface CloudMfaVerifyPayload {
  challengeToken: string;
  code: string;
}

export interface CloudMfaRecoveryPayload {
  challengeToken: string;
  recoveryCode: string;
}

export interface CloudSelectPharmacyPayload {
  selectionToken: string;
  pharmacyId: string;
}

// -----------------------------------------------------------------------------
// AUTHENTICATED USER
// -----------------------------------------------------------------------------

export interface CloudAuthUser {
  email: string;

  role: string;

  userType: string;

  pharmacyId: string;

  pharmacyName: string;

  licenseeFirstName: string;

  licenseeLastName: string;

  licenseeEmail: string;

  mustChangePassword?: boolean;

  canManageExtensions?: boolean;

  canManagePhoneNumbers?: boolean;

  canViewCallLogs?: boolean;
}

// -----------------------------------------------------------------------------
// AUTHENTICATED SESSION
// -----------------------------------------------------------------------------

export interface CloudAuthSession {
  kind: "authenticated";

  user: CloudAuthUser;

  /**
   * Short-lived RXAdmin access token.
   *
   * Memory-only.
   *
   * This is NOT the offline POS session credential.
   */
  accessToken: string;

  /**
   * Access-token expiry timestamp in milliseconds.
   */
  expiresAt: number;
}

// -----------------------------------------------------------------------------
// DEVICE APPROVAL
// -----------------------------------------------------------------------------

export interface CloudDeviceApprovalPending {
  kind: "device_approval_pending";

  status: string;

  message: string;
}

// -----------------------------------------------------------------------------
// MFA
// -----------------------------------------------------------------------------

export interface CloudMfaRequired {
  kind: "mfa_required";

  method?: string;

  challengeToken: string;
}

// -----------------------------------------------------------------------------
// PHARMACY SELECTION
// -----------------------------------------------------------------------------

export interface CloudPharmacyChoice {
  pharmacyId: string;

  pharmacyName?: string;

  [key: string]: unknown;
}

export interface CloudPharmacySelectionRequired {
  kind: "pharmacy_selection_required";

  selectionToken: string;

  pharmacies: CloudPharmacyChoice[];
}

// -----------------------------------------------------------------------------
// NORMALIZED AUTH RESULT
// -----------------------------------------------------------------------------

export type CloudAuthResult =
  | CloudAuthSession
  | CloudDeviceApprovalPending
  | CloudMfaRequired
  | CloudPharmacySelectionRequired;

export type CloudLoginResult = CloudAuthResult;

// -----------------------------------------------------------------------------
// OTP RESPONSES
// -----------------------------------------------------------------------------

export interface CloudOtpRequestResult {
  message: string;
}

export interface CloudOtpVerifyResult {
  verified: boolean;

  message?: string;
}

// -----------------------------------------------------------------------------
// RAW RXADMIN AUTH-V2 RESPONSE
// -----------------------------------------------------------------------------

export interface PortalLoginData {
  access_token: string;

  refresh_token: string;

  session_id?: string;

  expires_in: number;

  email: string;

  role: string;

  userType: string;

  pharmacyId: string;

  pharmacyName: string;

  licenseeFirstName: string;

  licenseeLastName: string;

  licenseeEmail: string;

  mustChangePassword?: boolean;

  canManageExtensions?: boolean;

  canManagePhoneNumbers?: boolean;

  canViewCallLogs?: boolean;
}

export interface PortalDeviceApprovalData {
  device_approval_required: true;

  status: string;

  message: string;
}

export interface PortalMfaRequiredData {
  mfa_required: true;

  mfa_method?: string;

  challenge_token: string;
}

export interface PortalPharmacySelectionData {
  pharmacy_selection_required: true;

  selection_token: string;

  pharmacies: CloudPharmacyChoice[];
}

export type PortalLoginResponseData =
  | PortalLoginData
  | PortalDeviceApprovalData
  | PortalMfaRequiredData
  | PortalPharmacySelectionData;

// -----------------------------------------------------------------------------
// RXADMIN API ENVELOPE
// -----------------------------------------------------------------------------

export interface PortalApiEnvelope<T> {
  success: boolean;

  data?: T;

  message?: string;

  error?: string;
}

// -----------------------------------------------------------------------------
// NORMALIZED RESULT TYPE GUARDS
// -----------------------------------------------------------------------------

export function isCloudAuthSession(
  result: CloudAuthResult,
): result is CloudAuthSession {
  return result.kind === "authenticated";
}

export function isCloudDeviceApprovalPending(
  result: CloudAuthResult,
): result is CloudDeviceApprovalPending {
  return result.kind === "device_approval_pending";
}

export function isCloudMfaRequired(
  result: CloudAuthResult,
): result is CloudMfaRequired {
  return result.kind === "mfa_required";
}

export function isCloudPharmacySelectionRequired(
  result: CloudAuthResult,
): result is CloudPharmacySelectionRequired {
  return result.kind === "pharmacy_selection_required";
}

// -----------------------------------------------------------------------------
// RAW RXADMIN RESPONSE TYPE GUARDS
// -----------------------------------------------------------------------------

export function isPortalDeviceApprovalData(
  data: PortalLoginResponseData,
): data is PortalDeviceApprovalData {
  return (
    "device_approval_required" in data &&
    data.device_approval_required === true
  );
}

export function isPortalMfaRequiredData(
  data: PortalLoginResponseData,
): data is PortalMfaRequiredData {
  return (
    "mfa_required" in data &&
    data.mfa_required === true
  );
}

export function isPortalPharmacySelectionData(
  data: PortalLoginResponseData,
): data is PortalPharmacySelectionData {
  return (
    "pharmacy_selection_required" in data &&
    data.pharmacy_selection_required === true
  );
}