// Server-side enforcement of the GEOFENCE /
// IP_RESTRICTED / QR_CODE attendance methods.
//
// Background:
//   Phase 7 MVP accepted the `method` field but trusted the client's
//   claim. The deep-dive §13 invariant #2 demands server validation
//   for the location-anchored methods. WEB and MANUAL stay
//   client-claim — WEB is the default for self-service browsers,
//   MANUAL is forced when an actor punches for someone else (and
//   gated by `hr.attendance.check-in.manual` at the route level).
//
// All three validators throw `AttendanceMethodDeniedError` on
// rejection — a 422 with code ATTENDANCE_METHOD_DENIED + a
// `rule` field naming the specific failure so the FE can render a
// helpful error toast.

import crypto from "crypto";

import { AppError } from "../../shared/errors/AppError";

export type StoreGeoConfig = {
  geoLat: number | null | { toString: () => string };
  geoLng: number | null | { toString: () => string };
  geoRadiusM: number | null;
  ipWhitelist: string[];
  attendanceMethods: string[];
};

export class AttendanceMethodDeniedError extends AppError {
  constructor(rule: string, message: string) {
    super(422, "ATTENDANCE_METHOD_DENIED", message, { rule });
    this.name = "AttendanceMethodDeniedError";
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function toNumber(v: number | null | { toString: () => string } | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

// Haversine — great-circle distance between two lat/lng pairs in
// meters. Earth radius 6_371_000 m. Accurate to <0.5% for distances
// under a few hundred km (way more than enough for store geofences).
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Parse a CIDR string ("203.0.113.0/24") into (network, prefixLen).
// Returns null on malformed input (caller treats as "doesn't match").
// Supports IPv4 only — IPv6 would need a separate path.
function parseCidr(cidr: string): { network: number; prefixLen: number } | null {
  const [addr, prefixStr] = cidr.split("/");
  if (!addr) return null;
  const prefixLen = prefixStr === undefined ? 32 : Number(prefixStr);
  if (!Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) {
    return null;
  }
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  let network = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    network = (network << 8) + n;
  }
  // Force unsigned 32-bit.
  network = network >>> 0;
  // Mask off host bits.
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return { network: (network & mask) >>> 0, prefixLen };
}

function ipToInt(addr: string): number | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) + n;
  }
  return out >>> 0;
}

// Normalise Express's req.ip — strips IPv6-mapped IPv4 prefix.
function normaliseIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function ipMatchesAnyCidr(ip: string, cidrs: string[]): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === null) return false;
  for (const c of cidrs) {
    const parsed = parseCidr(c);
    if (!parsed) continue;
    const mask = parsed.prefixLen === 0 ? 0 : (~0 << (32 - parsed.prefixLen)) >>> 0;
    if ((ipInt & mask) >>> 0 === parsed.network) return true;
  }
  return false;
}

// ── Method validators ───────────────────────────────────────────────

interface PunchInput {
  method: string;
  geo?: { lat?: number | null; lng?: number | null; accuracyM?: number | null } | null;
  qrToken?: string | null;
}

interface RequestMeta {
  ipAddress?: string | null;
}

/**
 * Checks whether the store accepts the requested method at all.
 * Empty `attendanceMethods` means "accept any" (back-compat).
 */
export function assertMethodAllowedByStore(
  method: string,
  store: Pick<StoreGeoConfig, "attendanceMethods">,
): void {
  if (store.attendanceMethods.length === 0) return;
  if (!store.attendanceMethods.includes(method)) {
    throw new AttendanceMethodDeniedError(
      "STORE_METHOD_NOT_CONFIGURED",
      `This store does not accept method ${method}`,
    );
  }
}

export function validateGeofence(input: PunchInput, store: StoreGeoConfig): void {
  const storeLat = toNumber(store.geoLat);
  const storeLng = toNumber(store.geoLng);
  const radius = store.geoRadiusM;
  if (storeLat === null || storeLng === null || !radius || radius <= 0) {
    throw new AttendanceMethodDeniedError(
      "STORE_GEO_NOT_CONFIGURED",
      "GEOFENCE method requires the store to have geoLat / geoLng / geoRadiusM configured",
    );
  }
  const lat = input.geo?.lat;
  const lng = input.geo?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new AttendanceMethodDeniedError(
      "MISSING_GEO_FIX",
      "GEOFENCE method requires a current geo fix (lat + lng) in the request",
    );
  }
  const distance = distanceMeters({ lat, lng }, { lat: storeLat, lng: storeLng });
  if (distance > radius) {
    throw new AttendanceMethodDeniedError(
      "OUTSIDE_GEOFENCE",
      `Punch location is ${Math.round(distance)} m from store; allowed radius is ${radius} m`,
    );
  }
}

export function validateIpRestricted(
  _input: PunchInput,
  store: StoreGeoConfig,
  requestMeta: RequestMeta,
): void {
  if (!store.ipWhitelist || store.ipWhitelist.length === 0) {
    throw new AttendanceMethodDeniedError(
      "STORE_IP_WHITELIST_EMPTY",
      "IP_RESTRICTED method requires the store to have ipWhitelist configured",
    );
  }
  const ip = normaliseIp(requestMeta.ipAddress);
  if (!ip) {
    throw new AttendanceMethodDeniedError(
      "MISSING_CLIENT_IP",
      "IP_RESTRICTED method requires the client IP to be resolvable",
    );
  }
  if (!ipMatchesAnyCidr(ip, store.ipWhitelist)) {
    throw new AttendanceMethodDeniedError(
      "IP_NOT_IN_WHITELIST",
      `Client IP ${ip} is not in the store's allowed whitelist`,
    );
  }
}

// ── QR token cache ──────────────────────────────────────────────────
//
// In-memory single-shot QR tokens with TTL. Production would use
// Redis; for the MVP an in-memory Map is enough — the tokens
// regenerate on every "show QR" call so even with a multi-instance
// deployment a single tenant's user typically scans on the same
// instance that issued the token.
//
// Token format: 32 random bytes base64url-encoded (43 chars). The
// `issue` call returns the plaintext token; the verify path
// consumes-on-success so a token can't be replayed.

interface QrTokenEntry {
  tenantId: string;
  storeId: string;
  employeeId: string | null;
  expiresAt: number;
}
const qrTokens = new Map<string, QrTokenEntry>();
const QR_TTL_MS = 60_000; // 60 s — matches typical QR display flow.

export function issueQrToken(
  tenantId: string,
  storeId: string,
  employeeId: string | null = null,
): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + QR_TTL_MS;
  qrTokens.set(token, { tenantId, storeId, employeeId, expiresAt });
  // Lazy GC: when we issue, sweep expired entries to keep the map
  // bounded. This avoids a separate timer.
  for (const [k, v] of qrTokens.entries()) {
    if (v.expiresAt <= Date.now()) qrTokens.delete(k);
  }
  return { token, expiresAt: new Date(expiresAt) };
}

export function validateQrToken(input: PunchInput, tenantId: string, storeId: string): void {
  if (!input.qrToken) {
    throw new AttendanceMethodDeniedError(
      "MISSING_QR_TOKEN",
      "QR_CODE method requires a qrToken in the request body",
    );
  }
  const entry = qrTokens.get(input.qrToken);
  if (!entry) {
    throw new AttendanceMethodDeniedError(
      "INVALID_QR_TOKEN",
      "QR token is invalid or already consumed",
    );
  }
  if (entry.expiresAt <= Date.now()) {
    qrTokens.delete(input.qrToken);
    throw new AttendanceMethodDeniedError(
      "QR_TOKEN_EXPIRED",
      "QR token has expired — please generate a fresh one",
    );
  }
  if (entry.tenantId !== tenantId || entry.storeId !== storeId) {
    // Don't leak tenant/store details; treat as invalid.
    throw new AttendanceMethodDeniedError("INVALID_QR_TOKEN", "QR token does not match this store");
  }
  // Consume on success.
  qrTokens.delete(input.qrToken);
}

// Test-only helper.
export function __clearQrTokensForTests(): void {
  qrTokens.clear();
}

// ── Aggregate enforcement ───────────────────────────────────────────

/**
 * Called by the attendance punch service after resolving the
 * target store. Picks the right validator per method, no-ops for
 * WEB / MANUAL / BIOMETRIC (BIOMETRIC has its own per-device auth
 * path — see OI-028).
 */
export function enforceAttendanceMethod(
  input: PunchInput,
  tenantId: string,
  storeId: string,
  store: StoreGeoConfig,
  requestMeta: RequestMeta,
): void {
  assertMethodAllowedByStore(input.method, store);
  switch (input.method) {
    case "GEOFENCE":
      validateGeofence(input, store);
      return;
    case "IP_RESTRICTED":
      validateIpRestricted(input, store, requestMeta);
      return;
    case "QR_CODE":
      validateQrToken(input, tenantId, storeId);
      return;
    case "WEB":
    case "MANUAL":
    case "BIOMETRIC":
      // Client-claim methods — no further check here.
      // (BIOMETRIC has its own auth path; MANUAL is gated at
      // the route level with `hr.attendance.check-in.manual`.)
      return;
    default:
      throw new AttendanceMethodDeniedError(
        "UNKNOWN_METHOD",
        `Unknown attendance method: ${input.method}`,
      );
  }
}
