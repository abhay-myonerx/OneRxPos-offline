import { describe, it, expect } from "vitest";
import * as licensing from "../index";

describe("licensing barrel", () => {
  it("re-exports the stable public API", () => {
    for (const name of [
      "getDeviceFingerprint",
      "resolveFingerprint",
      "isValidLicenseKey",
      "parseLicenseKey",
      "mintLicenseKey",
      "evaluateLicenseState",
      "createLicenseClient",
      "readLicenseStatus",
      "saveLicenseState",
      "readLicenseState",
    ]) {
      expect(typeof (licensing as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
