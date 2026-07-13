// Clean-machine packaging regression guard. Born from the 2026-07-10
// third-party boot failure (see rxpos-thirdparty-boot-failure): the shipped
// installer crashed on other machines with Prisma's "could not locate the
// Query Engine for runtime windows", because `tsc` never copies the native
// `query_engine-*.node` into `dist/generated/**`, so it was absent from the
// package — masked on the dev machine only because Prisma also searches the
// absolute `src/generated` path baked into the generated client.
//
// Two layers of coverage here:
//   1. A pure filesystem assertion that the SHIPPED backend contains the
//      Prisma engine binary. This is the reliable guard: it does not depend on
//      Prisma's runtime search order, so — unlike the boot test below — it
//      would have FAILED on the broken build.
//   2. A boot test that drives the REAL packaged artifacts under two clean-PC
//      conditions the packaged-acceptance test never applies: spawn binary =
//      the built `RX POS.exe` (not node_modules/electron), and a SCRUBBED,
//      Node-free Windows environment. Everything else (key derivation,
//      onboarding one-shot, startStoreNode) is the real code the app runs.
//      NOTE: on a dev machine this boot test can still pass with the engine
//      missing from the package (Prisma falls back to src/generated) — which
//      is exactly why assertion (1) exists and is the real guard.
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { startStoreNode, storeNodeDbPath, type StoreNodeHandle } from "../launcher";
import { deriveStoreNodeDbKey, ensureStoreNodeReady } from "../onboarding";
import { resolveStoreNodeResourcePaths } from "../resource-paths";
import { loadOrCreateStoreNodeSecrets } from "../store-node-config";

const desktopDir = path.resolve(__dirname, "..", "..", "..");
const resourcesPath = path.join(desktopDir, "dist-desktop", "win-unpacked", "resources");
const packagedExe = path.join(desktopDir, "dist-desktop", "win-unpacked", "RX POS.exe");

const resolved = resolveStoreNodeResourcePaths({
  isPackaged: true,
  appPath: desktopDir,
  resourcesPath,
});
const electronNativeOverride = {
  hookPath: resolved.hookPath,
  sqlcipherEntry: resolved.sqlcipherEntry,
};
const built =
  existsSync(packagedExe) && existsSync(resolved.backendDir) && existsSync(resolved.serverEntry);

// A fresh Windows user profile's environment — full system PATH, no Node, no
// dev vars. This is the crux of the repro: the real installed app gets exactly
// this, while the packaged-acceptance test gets `...process.env` (full dev env).
function scrubbedWindowsEnv(): NodeJS.ProcessEnv {
  const keep = [
    "SystemRoot", "windir", "SystemDrive", "COMSPEC", "ComSpec", "PATHEXT",
    "TEMP", "TMP", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA",
    "LOCALAPPDATA", "ProgramData", "ProgramFiles", "ProgramFiles(x86)",
    "ProgramW6432", "PUBLIC", "ALLUSERSPROFILE", "USERNAME", "USERDOMAIN",
    "COMPUTERNAME", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "OS",
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  const sysRoot = process.env.SystemRoot ?? "C:\\Windows";
  env.PATH = [
    `${sysRoot}\\System32`,
    sysRoot,
    `${sysRoot}\\System32\\Wbem`,
    `${sysRoot}\\System32\\WindowsPowerShell\\v1.0`,
  ].join(";");
  env.Path = env.PATH;
  return env;
}

describe.runIf(built)("clean-machine repro: packaged exe + scrubbed env", () => {
  // The reliable guard (see file header): the SHIPPED backend must carry the
  // Prisma native query engine. tsc doesn't copy *.node into dist/generated,
  // so without the backend's `postbuild` copy step this is absent and the app
  // dies on any machine lacking the dev `src/generated` fallback.
  it("ships the Prisma query engine binary alongside the generated sqlite client", () => {
    const sqliteClientDir = path.join(resolved.backendDir, "dist", "generated", "prisma-sqlite");
    expect(existsSync(sqliteClientDir)).toBe(true);
    const engines = readdirSync(sqliteClientDir).filter(
      (f) => f.startsWith("query_engine") && f.endsWith(".node"),
    );
    expect(
      engines.length,
      `No query_engine-*.node in ${sqliteClientDir}. tsc does not copy .node binaries; ` +
        "rx-pos-backend's `postbuild` (scripts/copy-prisma-engines.mjs) must run so the " +
        "packaged app can locate the Prisma engine on machines without the dev src/generated tree.",
    ).toBeGreaterThan(0);
  });

  it("boots the store-node backend the way a fresh PC would", async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), "rxpos-clean-repro-"));
    let handle: StoreNodeHandle | undefined;
    try {
      const dbPath = storeNodeDbPath(userDataDir);
      const secrets = loadOrCreateStoreNodeSecrets(userDataDir);
      const key = deriveStoreNodeDbKey({
        backendDir: resolved.backendDir,
        masterKey: secrets.LOCAL_DB_MASTER_KEY,
      });
      const cleanEnv = scrubbedWindowsEnv();

      console.log(`\n[repro] packagedExe = ${packagedExe}`);
      console.log(`[repro] scrubbed PATH = ${cleanEnv.PATH}\n`);

      const push = await ensureStoreNodeReady({
        dbPath,
        key,
        backendDir: resolved.backendDir,
        electronPath: packagedExe,
        oneShotScriptPath: resolved.oneShotScriptPath,
        electronNativeOverride,
        secrets,
        env: cleanEnv,
        onLog: (line) => console.log(line),
      });
      console.log(`[repro] ensureStoreNodeReady -> firstRun:${push.firstRun}`);

      handle = await startStoreNode({
        backendEntry: resolved.serverEntry,
        backendCwd: resolved.backendDir,
        userDataDir,
        electronPath: packagedExe,
        electronNativeOverride,
        env: cleanEnv,
        onLog: (line) => console.log(line),
      });
      console.log(`[repro] startStoreNode -> healthy on 127.0.0.1:${handle.port}`);
      expect(handle.port).toBeGreaterThan(0);
    } finally {
      if (handle) await handle.stop().catch(() => {});
      rmSync(userDataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
