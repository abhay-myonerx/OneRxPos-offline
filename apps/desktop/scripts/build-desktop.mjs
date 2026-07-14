// Cross-platform packaging pipeline:
//
// renderer build
//      ↓
// desktop esbuild
//      ↓
// backend extraResources staging
//      ↓
// clean previous Electron output
//      ↓
// electron-builder
//
// A plain npm script with `cd a && cd b && ...` is awkward to make
// portable across cmd.exe / PowerShell / POSIX shells.
//
// This Node wrapper sets `cwd` for every build step.
//
// `--dir`:
// Builds electron-builder's unpacked target instead of the full
// installer.
//
// Windows:
//   dist-desktop/win-unpacked/
//
// macOS:
//   dist-desktop/mac/
//   dist-desktop/mac-arm64/
//
// npm run build:desktop:dir passes --dir.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signingBanner } from "./signing-status.mjs";

const __dirname = path.dirname(
  fileURLToPath(import.meta.url),
);

const desktopDir = path.resolve(__dirname, "..");

const frontendDir = path.resolve(
  desktopDir,
  "..",
  "frontend",
);

const distDesktopDir = path.resolve(
  desktopDir,
  "dist-desktop",
);

const dirTarget = process.argv.includes("--dir");

const npmCmd =
  process.platform === "win32"
    ? "npm.cmd"
    : "npm";

/**
 * Execute an npm command in a specific working directory.
 */
function run(cwd, args) {
  console.log(
    `\n> (${cwd}) ${npmCmd} ${args.join(" ")}`,
  );

  // shell:true is required on Windows.
  //
  // spawnSync-ing npm.cmd directly may fail with EINVAL when
  // cwd contains spaces.
  //
  // Arguments here are fixed trusted build arguments and are
  // never sourced from user input.
  const result = spawnSync(npmCmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(
      "\nBuild command failed to start:",
      result.error,
    );

    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * Stop an existing development RX POS process.
 *
 * A previously launched win-unpacked/RX POS.exe process may keep
 * Chromium/Electron DLL files locked.
 *
 * Example:
 *
 * d3dcompiler_47.dll
 *
 * electron-builder must remove the previous output directory
 * before packaging the next application.
 */
function stopPreviousWindowsApp() {
  if (process.platform !== "win32") {
    return;
  }

  console.log(
    "\n> Checking for a running RX POS development process...",
  );

  const result = spawnSync(
    "taskkill",
    [
      "/F",
      "/IM",
      "RX POS.exe",
      "/T",
    ],
    {
      stdio: "ignore",
      shell: true,
    },
  );

  if (result.status === 0) {
    console.log(
      "> Previous RX POS process stopped.",
    );
  } else {
    console.log(
      "> No running RX POS process found.",
    );
  }
}

/**
 * Small synchronous delay.
 *
 * Windows may take a short amount of time to release DLL file
 * handles after the Electron process exits.
 */
function sleep(milliseconds) {
  const sharedBuffer = new SharedArrayBuffer(4);
  const sharedArray = new Int32Array(sharedBuffer);

  Atomics.wait(
    sharedArray,
    0,
    0,
    milliseconds,
  );
}

/**
 * Remove previous electron-builder output.
 */
function cleanPreviousBuild() {
  console.log(
    `\n> Cleaning previous Electron build output: ${distDesktopDir}`,
  );

  if (process.platform === "win32") {
    stopPreviousWindowsApp();

    // Give Windows time to release Electron/Chromium DLL handles.
    sleep(2000);
  }

  try {
    rmSync(distDesktopDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 1000,
    });

    console.log(
      "> Previous Electron build output cleaned.",
    );
  } catch (error) {
    console.error(
      "\nUnable to clean the previous Electron build output.",
    );

    if (process.platform === "win32") {
      console.error(
        "Close RX POS and verify no RX POS.exe process is running.",
      );

      console.error(
        "Then run the build again.",
      );
    }

    console.error(error);

    process.exit(1);
  }
}

// ============================================================
// STEP 1 — BUILD FRONTEND SPA
// ============================================================

run(frontendDir, [
  "run",
  "build:spa",
]);

// ============================================================
// STEP 2 — BUILD ELECTRON MAIN + PRELOAD
// ============================================================

run(desktopDir, [
  "run",
  "build",
]);

// ============================================================
// STEP 3 — PREPARE STORE-NODE BACKEND
// ============================================================
//
// This step:
//
// - builds rx-pos-backend
// - builds rx-pos-shared
// - generates Prisma SQLite client
// - rebuilds native SQLite module for Electron
// - generates sqlite-schema.sql
// - installs production-only backend dependencies
// - bundles server.bundle.cjs
//
// Your latest build reached and completed this staging pipeline.
// The log shows the staged backend and production-only dependency
// closure were created successfully.

run(desktopDir, [
  "run",
  "prepare:backend-resources",
]);

// ============================================================
// STEP 4 — CLEAN PREVIOUS ELECTRON OUTPUT
// ============================================================
//
// IMPORTANT:
//
// Run cleanup AFTER backend staging.
//
// The staging directory lives under:
//
// apps/desktop/.staging
//
// Therefore cleaning dist-desktop does not remove backend staging.

cleanPreviousBuild();

// ============================================================
// STEP 5 — SIGNING STATUS
// ============================================================

console.log(
  signingBanner(process.env),
);

// ============================================================
// STEP 6 — PACKAGE ELECTRON APPLICATION
// ============================================================

run(desktopDir, [
  "exec",
  "--",
  "electron-builder",
  "--config",
  "electron-builder.yml",
  ...(dirTarget ? ["--dir"] : []),
]);