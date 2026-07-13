// Server-side attendance method enforcement.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __clearQrTokensForTests,
  assertMethodAllowedByStore,
  distanceMeters,
  enforceAttendanceMethod,
  ipMatchesAnyCidr,
  issueQrToken,
  validateGeofence,
  validateIpRestricted,
  validateQrToken,
  type StoreGeoConfig,
} from "../attendance.methods";

const storeAt = (
  lat: number,
  lng: number,
  radius: number,
  extras: Partial<StoreGeoConfig> = {},
): StoreGeoConfig => ({
  geoLat: lat,
  geoLng: lng,
  geoRadiusM: radius,
  ipWhitelist: extras.ipWhitelist ?? [],
  attendanceMethods: extras.attendanceMethods ?? [],
});

describe("distanceMeters — haversine", () => {
  it("zero distance for the same point", () => {
    expect(distanceMeters({ lat: 23.78, lng: 90.41 }, { lat: 23.78, lng: 90.41 })).toBe(0);
  });

  it("approximates a known short distance", () => {
    // ~111 m per 0.001 degree of latitude near the equator-adjacent
    // tropics. 0.001 degree at lat 23 should be ≈ 110 m.
    const d = distanceMeters({ lat: 23.0, lng: 90.0 }, { lat: 23.001, lng: 90.0 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });
});

describe("validateGeofence", () => {
  const dhaka = { lat: 23.7806, lng: 90.4193 };
  const store = storeAt(dhaka.lat, dhaka.lng, 100);

  it("passes when within radius", () => {
    expect(() =>
      validateGeofence(
        {
          method: "GEOFENCE",
          geo: { lat: dhaka.lat + 0.0001, lng: dhaka.lng },
        },
        store,
      ),
    ).not.toThrow();
  });

  it("rejects when outside radius", () => {
    expect(() =>
      validateGeofence(
        {
          method: "GEOFENCE",
          geo: { lat: dhaka.lat + 0.01, lng: dhaka.lng },
        },
        store,
      ),
    ).toThrow(/from store/);
  });

  it("rejects when geo fix missing", () => {
    expect(() => validateGeofence({ method: "GEOFENCE" }, store)).toThrow(/geo fix/i);
  });

  it("rejects when store has no geo config", () => {
    expect(() =>
      validateGeofence({ method: "GEOFENCE", geo: { lat: 0, lng: 0 } }, { ...store, geoLat: null }),
    ).toThrow(/store to have geoLat/);
  });
});

describe("ipMatchesAnyCidr / validateIpRestricted", () => {
  it("matches bare IP /32 implicitly", () => {
    expect(ipMatchesAnyCidr("203.0.113.5", ["203.0.113.5"])).toBe(true);
    expect(ipMatchesAnyCidr("203.0.113.6", ["203.0.113.5"])).toBe(false);
  });

  it("matches inside a CIDR range", () => {
    expect(ipMatchesAnyCidr("203.0.113.42", ["203.0.113.0/24"])).toBe(true);
    expect(ipMatchesAnyCidr("203.0.114.42", ["203.0.113.0/24"])).toBe(false);
  });

  it("validateIpRestricted passes when IP in whitelist", () => {
    const store: StoreGeoConfig = {
      ...storeAt(0, 0, 0),
      ipWhitelist: ["203.0.113.0/24"],
    };
    expect(() =>
      validateIpRestricted({ method: "IP_RESTRICTED" }, store, { ipAddress: "203.0.113.42" }),
    ).not.toThrow();
  });

  it("validateIpRestricted rejects when whitelist empty", () => {
    const store: StoreGeoConfig = storeAt(0, 0, 0);
    expect(() =>
      validateIpRestricted({ method: "IP_RESTRICTED" }, store, { ipAddress: "1.2.3.4" }),
    ).toThrow(/have ipWhitelist/);
  });

  it("strips IPv6-mapped IPv4 prefix when matching", () => {
    const store: StoreGeoConfig = {
      ...storeAt(0, 0, 0),
      ipWhitelist: ["10.0.0.0/8"],
    };
    expect(() =>
      validateIpRestricted({ method: "IP_RESTRICTED" }, store, { ipAddress: "::ffff:10.1.2.3" }),
    ).not.toThrow();
  });
});

describe("QR token issue + validate (single-shot, TTL)", () => {
  beforeEach(() => __clearQrTokensForTests());
  afterEach(() => __clearQrTokensForTests());

  it("issued token validates exactly once", () => {
    const { token } = issueQrToken("t1", "s1");
    expect(() => validateQrToken({ method: "QR_CODE", qrToken: token }, "t1", "s1")).not.toThrow();
    // Replay → rejected.
    expect(() => validateQrToken({ method: "QR_CODE", qrToken: token }, "t1", "s1")).toThrow(
      /invalid/i,
    );
  });

  it("rejects when tenant/store mismatch", () => {
    const { token } = issueQrToken("t1", "s1");
    expect(() => validateQrToken({ method: "QR_CODE", qrToken: token }, "t1", "s2")).toThrow();
  });

  it("rejects when token missing", () => {
    expect(() => validateQrToken({ method: "QR_CODE" }, "t1", "s1")).toThrow(/requires a qrToken/);
  });
});

describe("assertMethodAllowedByStore", () => {
  it("empty attendanceMethods = no restriction", () => {
    expect(() => assertMethodAllowedByStore("GEOFENCE", { attendanceMethods: [] })).not.toThrow();
  });

  it("non-empty list = whitelist", () => {
    expect(() =>
      assertMethodAllowedByStore("GEOFENCE", {
        attendanceMethods: ["WEB", "MANUAL"],
      }),
    ).toThrow(/does not accept method/);
  });
});

describe("enforceAttendanceMethod — aggregate dispatch", () => {
  it("no-ops for WEB", () => {
    expect(() =>
      enforceAttendanceMethod({ method: "WEB" }, "t1", "s1", storeAt(0, 0, 0), {}),
    ).not.toThrow();
  });

  it("dispatches to validateGeofence for GEOFENCE", () => {
    expect(() =>
      enforceAttendanceMethod({ method: "GEOFENCE" }, "t1", "s1", storeAt(23.78, 90.41, 100), {}),
    ).toThrow(/geo fix/i);
  });

  it("rejects unknown methods", () => {
    expect(() =>
      enforceAttendanceMethod({ method: "EMOJI" }, "t1", "s1", storeAt(0, 0, 0), {}),
    ).toThrow();
  });
});
