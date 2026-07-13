// Fetches the Electron ABI-146 prebuilt binary for better-sqlite3-multiple-ciphers.
//
// Why: this repo pins Electron to 42.0.0 (ABI 146) specifically because the
// module publishes a prebuilt binary for that ABI (verified by the SN-4 spike:
// abi 148 / Electron 43 has NO prebuild, and this machine has no C++ build
// toolchain, so compiling is not an option). `npm install` alone leaves the
// module's default NODE-abi binary in place (built for the Node version running
// npm, not for Electron) — this script overwrites it with the Electron build by
// running `prebuild-install` with the Electron runtime/target/arch, using the
// `prebuild-install` binary that ships as a dependency of
// better-sqlite3-multiple-ciphers itself. No compiler is invoked.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const moduleDir = path.join(desktopDir, "node_modules", "better-sqlite3-multiple-ciphers");

const prebuildInstallBin = path.join(
  desktopDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prebuild-install.cmd" : "prebuild-install",
);

const args = ["--runtime", "electron", "--target", "42.0.0", "--arch", "x64"];

console.log(`> (${moduleDir}) prebuild-install ${args.join(" ")}`);
// Node's `shell: true` on Windows quotes each *argument* automatically but NOT the
// executable itself (per the child_process docs), so a path containing spaces (this
// repo lives under ".../source code/...") must be quoted here manually or cmd.exe
// mis-splits it.
const result = spawnSync(process.platform === "win32" ? `"${prebuildInstallBin}"` : prebuildInstallBin, args, {
  cwd: moduleDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  console.error(
    "\nprebuild-install failed to fetch the Electron abi-146 prebuild. " +
      "Do NOT fall back to compiling (node-gyp) — this machine has no C++ toolchain. " +
      "Check network access / the module's GitHub releases for an electron-v42.0.0 prebuild.",
  );
  process.exit(result.status ?? 1);
}

console.log("\nElectron abi-146 prebuild installed for better-sqlite3-multiple-ciphers.");
