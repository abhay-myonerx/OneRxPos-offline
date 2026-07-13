// Request/response shapes for `/api/v2/pos/*` (mirrors the backend's
// zod schemas in rx-pos-backend/src/modules/pos-auth/*.validation.ts and the
// `data` payloads its controllers return).

export interface EnrollDeviceRequest {
  storeId: string;
  fingerprint: string;
  name?: string;
}

// Matches the Prisma `EnrolledDevice` row returned by `enroll.service.ts`.
export interface EnrolledDevice {
  id: string;
  tenantId: string;
  storeId: string;
  fingerprint: string;
  name?: string | null;
  enrolledByUserId: string;
  enrolledAt: string;
  revokedAt: string | null;
}

export interface PinLoginRequest {
  deviceFingerprint: string;
  userId: string;
  pin: string;
}

// `pin.service.ts`'s `pinLogin` — access + refresh tokens for PIN quick-login.
export interface PinLoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface SetPinRequest {
  pin: string;
}

export interface SetPinResponse {
  userId: string;
  set: boolean;
}

export interface RequestOverrideRequest {
  action: string;
  authorizerUserId: string;
  pin: string;
  deviceFingerprint: string;
  context: string;
}

// `override.controller.ts` wraps the signed grant string under `{ grant }`.
export interface RequestOverrideResponse {
  grant: string;
}
