// Portable `npm run verify:native`: runs scripts/verify-native.mjs under
// Electron-as-node (ELECTRON_RUN_AS_NODE=1 <electron.exe> verify-native.mjs).
//
// Why a wrapper instead of a plain npm script string: this repo is Windows +
// bash, and there's no portable single-line way to set an env var and invoke
// `require('electron')`'s resolved binary path (which may contain spaces —
// this repo lives under ".../source code/...") across cmd.exe/PowerShell/bash.
// A tiny Node wrapper sidesteps all of that.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const verifyScript = path.join(__dirname, "verify-native.mjs");

console.log(`> ELECTRON_RUN_AS_NODE=1 "${electronPath}" "${verifyScript}"`);

try {
  execFileSync(electronPath, [verifyScript], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
} catch (err) {
  console.error("\nverify:native failed (see output above).");
  process.exit(err.status ?? 1);
}
