// Fixes WATCH-SN4-1 WITHOUT touching rx-pos-backend at all.
//
// The desktop spawns the store-node backend as a child under Electron-as-node
// (ABI 146). The backend's OWN `node_modules/better-sqlite3-multiple-ciphers`
// is built for whatever plain-Node ABI `rx-pos-backend`'s own dev/test tooling
// uses (137 as of this writing) — required by `npm test` / `npm run dev` in
// that repo. Overwriting that copy in place (an earlier version of this
// script did exactly that) fixes the spawned child but BREAKS the backend's
// own test suite the moment `new Database()` runs under plain Node again
// (verified live during SN-4 Task 2 — `npm test` in rx-pos-backend went from
// 1002/1002 passing to 28 failures). A single `.node` binary can't serve two
// incompatible ABIs at once, so this script keeps them physically separate:
//
//   1. `rx-pos-desktop/native/` is a PRIVATE, desktop-owned npm project (see
//      native/package.json) with its own `node_modules/better-sqlite3-
//      multiple-ciphers` — entirely independent of rx-pos-backend's copy.
//   2. This script installs it (if missing) and points `prebuild-install` at
//      THAT copy with `--runtime electron --target 42.0.0`, using electron's
//      already-cached prebuild-install binary and cache (no compiler).
//   3. At spawn time, `launcher.ts` passes `--require
//      electron-native-require-hook.cjs` to the child + an env var pointing
//      at this private copy's entry — the hook redirects ONLY
//      `require("better-sqlite3-multiple-ciphers")` to it, transparently,
//      for that one spawned process. rx-pos-backend's own node_modules is
//      never read, written, or required by this fix.
//
// Run whenever `rx-pos-desktop/native/node_modules` is missing/stale:
// `npm run rebuild:native:backend` (from rx-pos-desktop).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const nativeDir = path.join(desktopDir, "native");
const moduleDir = path.join(nativeDir, "node_modules", "better-sqlite3-multiple-ciphers");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, cmd, args, opts) {
  console.log(`\n> (${opts.cwd}) ${label}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// Step 1: install the private copy if it isn't there yet.
if (!existsSync(moduleDir)) {
  console.log(`Private native module copy missing at ${moduleDir} — installing...`);
  run("npm install", npmCmd, ["install"], { cwd: nativeDir });
} else {
  console.log(`Private native module copy already present at ${moduleDir}.`);
}

// Step 2: point prebuild-install (installed as a dependency of
// better-sqlite3-multiple-ciphers itself, inside this private copy) at the
// Electron ABI-146 prebuild, same technique as rebuild-native.mjs (Task 1).
const prebuildInstallBin = path.join(
  nativeDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prebuild-install.cmd" : "prebuild-install",
);
const args = ["--runtime", "electron", "--target", "42.0.0", "--arch", "x64"];

// See rebuild-native.mjs for why the exe path is quoted manually on Windows
// (shell:true quotes each argument but not the executable itself, and this
// repo's path contains a space: ".../source code/...").
run(
  `prebuild-install ${args.join(" ")}`,
  process.platform === "win32" ? `"${prebuildInstallBin}"` : prebuildInstallBin,
  args,
  { cwd: moduleDir },
);

console.log(
  "\nElectron abi-146 prebuild installed for the PRIVATE better-sqlite3-multiple-ciphers copy " +
    `at ${moduleDir} (fixes WATCH-SN4-1). rx-pos-backend's own node_modules was not touched — ` +
    "its dev/test suite keeps using its own plain-Node build.",
);
