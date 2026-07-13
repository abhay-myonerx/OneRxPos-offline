// Brand guard (mirrors the frontend no-direct-next-nav seam guard): src must
// carry no `posvelo` except the deliberate legacy backward-compat allowlist.
import { test, expect } from "vitest";
import fg from "fast-glob";
import { readFileSync } from "node:fs";

// Files permitted to contain "posvelo" (documented legacy compatibility).
const ALLOW = new Set<string>([
  "src/lib/encryption.ts", // LEGACY_HKDF_BRAND = "posvelo" (decrypt backward-compat)
  "src/lib/__tests__/no-posvelo.test.ts", // this guard necessarily names the string it forbids
]);

test("no posvelo references in backend src outside the legacy allowlist", () => {
  const files = fg.sync(["src/**/*.{ts,tsx}"], { cwd: process.cwd() });
  const offenders = files.filter((f) => {
    if (ALLOW.has(f)) return false;
    return /posvelo/i.test(readFileSync(f, "utf8"));
  });
  expect(offenders).toEqual([]);
});
