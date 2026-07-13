// Cross-platform packaging pipeline: renderer build -> desktop esbuild ->
// backend extraResources staging (SN-5 Task 3) -> electron-builder.
// A plain npm script with `cd a && cd b && ...` is awkward to make portable across
// cmd.exe/PowerShell/POSIX shells (especially with the "source code" space in this repo's
// path), so this is a small Node wrapper that sets `cwd` per step instead of shelling `cd`.
//
// `--dir`: build electron-builder's unpacked `--dir` target (dist-desktop/win-unpacked/)
// instead of the full NSIS installer — much faster, used by SN-5 Task 3 to retire the
// "does the packaged backend boot offline" risk without paying for a full installer build
// on every iteration. `npm run build:desktop:dir` passes this through.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { signingBanner } from "./signing-status.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const frontendDir = path.resolve(desktopDir, "..", "rx-pos-frontend");

const dirTarget = process.argv.includes("--dir");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(cwd, args) {
  console.log(`\n> (${cwd}) ${npmCmd} ${args.join(" ")}`);
  // shell:true is required on Windows: spawnSync-ing npm.cmd directly fails with EINVAL
  // when cwd contains spaces (this repo's "source code" segment). Args here are fixed,
  // trusted literals (never user input), so shell-arg-injection is not a concern.
  const result = spawnSync(npmCmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(frontendDir, ["run", "build:spa"]);
run(desktopDir, ["run", "build"]);
run(desktopDir, ["run", "prepare:backend-resources"]);
console.log(signingBanner(process.env));
run(desktopDir, [
  "exec",
  "--",
  "electron-builder",
  "--config",
  "electron-builder.yml",
  ...(dirTarget ? ["--dir"] : []),
]);
