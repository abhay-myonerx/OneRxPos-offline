import { describe, it, expect, vi } from "vitest";
import { runLicenseValidation } from "../license.processor";

describe("runLicenseValidation", () => {
  it("validates then returns the evaluated status", async () => {
    const validate = vi.fn().mockResolvedValue({ ok: true });
    const status = await runLicenseValidation({
      validate,
      readStatus: () => ({ status: "active", plan: "standard", lastValidatedAt: 1, graceExpiresAt: 2, fingerprint: "f" }),
      now: 100,
    });
    expect(validate).toHaveBeenCalledWith(100);
    expect(status).toBe("active");
  });
});
