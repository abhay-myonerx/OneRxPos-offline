import { describe, it, expect } from "vitest";
import { discoverDevices } from "../device-discovery";

describe("device-discovery", () => {
  it(
    "returns serial + hid + printer lists (fail-soft, native modules load under Node)",
    async () => {
      const d = await discoverDevices();
      expect(Array.isArray(d.serial)).toBe(true);
      expect(Array.isArray(d.hid)).toBe(true);
      expect(Array.isArray(d.printers)).toBe(true);
      // Shape check on any HID device present on the runner.
      for (const h of d.hid) {
        expect(typeof h.vendorId).toBe("number");
        expect(typeof h.productId).toBe("number");
      }
    },
    // Windows printer enumeration spawns PowerShell (Get-Printer), which is slow.
    20000,
  );
});
