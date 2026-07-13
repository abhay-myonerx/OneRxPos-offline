import { describe, it, expect } from "vitest";
import { isValidLicenseKey, mintLicenseKey, parseLicenseKey } from "../license-key";

describe("license key", () => {
  it("mints a valid XXXXX-XXXXX-XXXXX-XXXXX key", () => {
    const key = mintLicenseKey("tenant-1:seed");
    expect(key).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    expect(isValidLicenseKey(key)).toBe(true);
  });
  it("rejects a key with a corrupted checksum group", () => {
    const key = mintLicenseKey("s");
    const groups = key.split("-");
    const badLast = groups[3] === "AAAAA" ? "BBBBB" : "AAAAA";
    expect(isValidLicenseKey(`${groups[0]}-${groups[1]}-${groups[2]}-${badLast}`)).toBe(false);
  });
  it("rejects wrong length / charset / separators", () => {
    expect(isValidLicenseKey("ABC-DEF")).toBe(false);
    expect(isValidLicenseKey("IIIII-IIIII-IIIII-IIIII")).toBe(false); // I excluded
    expect(isValidLicenseKey("AAAAA_AAAAA_AAAAA_AAAAA")).toBe(false);
  });
  it("parse returns groups for a valid key, null otherwise", () => {
    const key = mintLicenseKey("s");
    expect(parseLicenseKey(key)?.groups).toHaveLength(4);
    expect(parseLicenseKey("nope")).toBeNull();
  });
});
