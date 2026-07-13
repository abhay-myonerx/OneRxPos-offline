// Brand guard (mirrors the no-direct-next-nav seam guard): src must carry
// no `posvelo` except the deliberate migrate-on-read legacy-key allowlist.
import fg from "fast-glob";
import { readFileSync } from "node:fs";

// Files permitted to contain "posvelo" (migrate-on-read legacy keys).
const ALLOW = new Set<string>([
  "src/lib/theme/theme.ts", // LEGACY_THEME_STORAGE_KEY = "posvelo.theme"
  "src/lib/i18n/locale-storage.ts", // LEGACY_LOCALE_STORAGE_KEY = "posvelo.locale"
  "src/shell/__tests__/no-posvelo.test.ts", // this guard necessarily names the string it forbids
]);

test("no posvelo references in frontend src outside the migration allowlist", () => {
  const files = fg.sync(["src/**/*.{ts,tsx}"], { cwd: process.cwd() });
  const offenders = files.filter((f) => {
    if (ALLOW.has(f)) return false;
    return /posvelo/i.test(readFileSync(f, "utf8"));
  });
  expect(offenders).toEqual([]);
});
