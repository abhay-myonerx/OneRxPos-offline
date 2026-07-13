// Seam guard: shared app code must route navigation through @/shell/nav so
// the Vite/React-Router SPA shell and the Next.js shell can both implement
// it. Only the Next-only redirect shims (replaced by <Navigate> routes in
// the SPA route tree) and the shell/nav Next implementation itself are
// allowed to import next/navigation or next/link directly.
import fg from "fast-glob";
import { readFileSync } from "node:fs";

const ALLOW = new Set([
  "src/app/page.tsx",
  "src/app/(auth)/page.tsx",
  "src/app/(dashboard)/hr/payroll/page.tsx",
  "src/app/layout.tsx",
  "src/shell/nav/index.tsx",
  "src/shell/media/index.ts",
]);

test("no shared component imports next/navigation, next/link, next/image, or next/font directly", () => {
  const files = fg.sync(["src/**/*.{ts,tsx}"], { cwd: process.cwd() });
  const offenders = files.filter((f) => {
    if (ALLOW.has(f)) return false;
    if (f.startsWith("src/app/api/")) return false;
    const s = readFileSync(f, "utf8");
    return /from "next\/(navigation|link|image|font)"/.test(s);
  });
  expect(offenders).toEqual([]);
});
