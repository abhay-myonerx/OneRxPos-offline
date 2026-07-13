import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(__dirname, "../../../../prisma/schema.prisma"), "utf8");

describe("licensing prisma models", () => {
  it("declares License with key + seatCap + status", () => {
    expect(schema).toMatch(/model License \{[\s\S]*key\s+String\s+@unique[\s\S]*seatCap\s+Int[\s\S]*status\s+String[\s\S]*\}/);
  });
  it("declares DeviceActivation with a unique (licenseId, deviceFingerprint)", () => {
    expect(schema).toMatch(/model DeviceActivation \{[\s\S]*@@unique\(\[licenseId, deviceFingerprint\]\)[\s\S]*\}/);
  });
});
