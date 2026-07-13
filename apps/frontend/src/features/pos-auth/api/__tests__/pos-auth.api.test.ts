import { describe, it, expect } from "vitest";
import * as api from "../pos-auth.api";

describe("pos-auth api", () => {
  it("exports the mutation hooks", () => {
    for (const h of [
      "usePinLoginMutation",
      "useEnrollDeviceMutation",
      "useSetPinMutation",
      "useRequestOverrideMutation",
    ]) {
      expect(typeof (api as Record<string, unknown>)[h]).toBe("function");
    }
  });

  it("getLaneFingerprint returns a stable dev fallback without a bridge", async () => {
    const a = await api.getLaneFingerprint();
    const b = await api.getLaneFingerprint();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });
});
