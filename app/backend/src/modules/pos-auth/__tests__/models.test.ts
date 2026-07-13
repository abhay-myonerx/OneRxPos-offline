import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const schema = readFileSync(join(__dirname, "../../../../prisma/schema.prisma"), "utf8");
describe("pos-auth models", () => {
  it("EnrolledDevice has a unique (tenantId, fingerprint)", () => {
    expect(schema).toMatch(/model EnrolledDevice \{[\s\S]*@@unique\(\[tenantId, fingerprint\]\)[\s\S]*\}/);
  });
  it("UserPin is keyed by userId with a pinHash", () => {
    expect(schema).toMatch(/model UserPin \{[\s\S]*pinHash\s+String[\s\S]*\}/);
  });
  it("PinLockout tracks attempts + lockedUntil per user+device", () => {
    expect(schema).toMatch(/model PinLockout \{[\s\S]*attempts\s+Int[\s\S]*lockedUntil\s+DateTime\?[\s\S]*\}/);
  });
});
