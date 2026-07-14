// scripts/prepare-backend-resources.mjs
// SN-5 Task 3 (pre-package step, run before electron-builder — see
// build-desktop.mjs), PLUS the SN-5 "prune to production-only" pass. Prepares
// everything the packaged store-node needs under `resources/backend`
// (electron-builder.yml's `.staging/backend` extraResources entry):
//
//   1. Builds rx-pos-backend (`npm run build`: tsc + tsc-alias — its own
//      `prebuild` script builds rx-pos-shared and regenerates both Prisma
//      clients first, so this one command produces a complete, current
//      `dist/`, including `dist/generated/**` — both generated Prisma
//      clients).
//   2. Ensures the desktop's private, Electron ABI-146 build of
//      better-sqlite3-multiple-ciphers exists (`npm run rebuild:native:backend`,
//      idempotent — see that script's own header for why it's a SEPARATE
//      copy from the backend's own plain-Node build).
//   3. ALWAYS regenerates the SN-5 Task 2 build-time pre-generated DDL
//      (`prisma/sqlite-schema.sql`) via `npm run db:ddl:sqlite` so the shipped
//      schema can never be stale relative to `schema.sqlite.prisma`.
//   4. Stages a SLIMMED rx-pos-shared (dist/ + package.json only — no dev
//      node_modules) as a scratch sibling of a scratch backend copy, then
//      runs `npm ci --omit=dev --ignore-scripts` in that scratch backend
//      copy to compute the REAL production dependency closure (not a
//      hand-picked include/exclude list — npm's own resolver, so it can't
//      drift from package.json/package-lock.json).
//   5. Deletes the handful of dev-tooling packages that survive
//      `--omit=dev` anyway because `@prisma/client` formally
//      `peerDependencies`s `prisma` (the CLI) and `typescript` — npm 7+
//      auto-installs required peers regardless of `--omit=dev` (a
//      peerDependency isn't a devDependency). Both are pure build-time
//      tooling: Prisma codegen already ran in step 1 (`dist/generated/**`
//      is already on disk), and this project's adapter-better-sqlite3 path
//      uses the WASM query compiler baked into `@prisma/client` itself —
//      grepping `dist/generated/**` and `@prisma/client`'s own runtime
//      confirms neither ever `require()`s the `prisma` package or
//      `@prisma/engines`. `@prisma/engines`/`-version`/`fetch-engine`/
//      `get-platform` are only pulled in as `prisma`'s OWN dependency chain
//      (confirmed via `npm ls <pkg> --omit=dev --all`), so they're orphaned
//      once `prisma` itself is removed.
//   6. Flattens the resulting production-only `dist/` + `node_modules/` +
//      `prisma/` into `.staging/backend`, with symlinks DEREFERENCED
//      (`fs.cpSync(..., { dereference: true })`). This matters because two
//      `file:` dependencies resolve to symlinks pointing OUTSIDE the backend
//      repo (`node_modules/rx-pos-shared` -> the scratch slimmed
//      rx-pos-shared staged in step 4; `node_modules/better-sqlite3` -> the
//      backend's own `src/local/sqlcipher-shim`) — copying those as literal
//      symlinks would bake this dev machine's absolute paths into the
//      shipped app (broken on any other machine, and broken here too once
//      the dev tree moves). Dereferencing turns both into ordinary,
//      portable files.
//
// The scratch `.staging/_prod-build` directory (steps 4-5) is deleted once
// step 6's flatten completes — it's a computation aid, not a shipped
// artifact. Only `.staging/backend` (the flattened, pruned result) is
// referenced by electron-builder.yml's extraResources.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const backendDir = path.resolve(desktopDir, "..", "backend");
const sharedDir = path.resolve(desktopDir, "..", "..", "packages", "shared");
const stagingDir = path.join(desktopDir, ".staging", "backend");
const prodBuildDir = path.join(desktopDir, ".staging", "_prod-build");
const prodBackendDir = path.join(prodBuildDir, "backend");
const prodSharedDir = path.join(prodBuildDir, "rx-pos-shared");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, cwd, args) {
  console.log(`\n> (${cwd}) ${npmCmd} ${args.join(" ")}`);
  // shell:true on Windows — same reason as build-desktop.mjs's run(): npm.cmd
  // spawned directly fails with EINVAL when cwd contains a space ("source
  // code"). Args are fixed, trusted literals, never user input.
  const result = spawnSync(npmCmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\nprepare-backend-resources: "${label}" failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function requireExists(p, hint) {
  if (!existsSync(p)) {
    console.error(`prepare-backend-resources: missing ${p}${hint ? ` — ${hint}` : ""}`);
    process.exit(1);
  }
}

// Step 1: build the backend.
run("npm run build (rx-pos-backend)", backendDir, ["run", "build"]);

// Step 2: ensure the packaged, Electron-targeted native module copy exists
// (safe to re-run; rebuild-native-backend.mjs no-ops the install step if the
// private copy is already there and just re-asserts the abi-146 prebuild).
run("npm run rebuild:native:backend (rx-pos-desktop)", desktopDir, [
  "run",
  "rebuild:native:backend",
]);

// Step 3: (re)generate the SN-5 Task 2 pre-generated DDL. ALWAYS regenerate —
// never "leave as-is". `db:ddl:sqlite` is deterministic (byte-identical when the
// committed file is already current, per sqlite-ddl-pregenerated.test.ts), so an
// unconditional run is idempotent when up to date, but it GUARANTEES the shipped
// `sqlite-schema.sql` matches the current `schema.sqlite.prisma`. Leaving a stale
// committed file in place would silently ship an out-of-date MONEY schema
// (missing tables/columns) on any local build that skips the backend test gate.
const ddlPath = path.join(backendDir, "prisma", "sqlite-schema.sql");
console.log(`\nRegenerating ${ddlPath} via db:ddl:sqlite (always, to prevent shipping a stale schema)`);
run("npm run db:ddl:sqlite (rx-pos-backend)", backendDir, ["run", "db:ddl:sqlite"]);
const schemaPath = path.join(backendDir, "prisma", "schema.sqlite.prisma");
requireExists(
  schemaPath,
  "cannot stage backend resources (the sync-trigger DDL is derived by parsing this file at push time).",
);

// Step 4: assemble the scratch inputs for a clean production-only install.
console.log(`\nAssembling scratch prod-build inputs -> ${prodBuildDir}`);
rmSync(prodBuildDir, { recursive: true, force: true });
mkdirSync(prodSharedDir, { recursive: true });
mkdirSync(prodBackendDir, { recursive: true });

// 4a. Slimmed rx-pos-shared: dist/ + package.json only. It's consumed via a
// `file:../rx-pos-shared` dependency, so npm just copies/links exactly what's
// here — giving us "ship only dist + prod deps" for free, with no hand-rolled
// filtering. Its one prod dep, decimal.js, is NOT bundled here: rx-pos-backend
// also depends on decimal.js directly, so Node's module resolution finds it
// via the normal node_modules walk-up once both are flattened together in
// step 6 (verified — see the prune report).
const sharedDistSrc = path.join(sharedDir, "dist");
requireExists(sharedDistSrc, "was rx-pos-shared built? (npm run build)");
console.log("  staging slimmed rx-pos-shared (dist/ + package.json, no dev node_modules)...");
cpSync(sharedDistSrc, path.join(prodSharedDir, "dist"), { recursive: true, dereference: true });
cpSync(path.join(sharedDir, "package.json"), path.join(prodSharedDir, "package.json"));

// 4b. Backend inputs `npm ci` needs: dist/, prisma/, package.json,
// package-lock.json, and the `file:./src/local/sqlcipher-shim` dependency's
// real target (its relative file: spec must resolve during install).
for (const sub of ["dist", "prisma"]) {
  const src = path.join(backendDir, sub);
  requireExists(src, "was the backend built?");
  cpSync(src, path.join(prodBackendDir, sub), { recursive: true, dereference: true });
}
cpSync(path.join(backendDir, "package.json"), path.join(prodBackendDir, "package.json"));
cpSync(path.join(backendDir, "package-lock.json"), path.join(prodBackendDir, "package-lock.json"));
mkdirSync(path.join(prodBackendDir, "src", "local"), { recursive: true });
cpSync(
  path.join(backendDir, "src", "local", "sqlcipher-shim"),
  path.join(prodBackendDir, "src", "local", "sqlcipher-shim"),
  { recursive: true, dereference: true },
);

// Step 5: the clean production install — the whole point of this pass.
// `--ignore-scripts` matters beyond just skipping build tooling: it also
// prevents `@prisma/engines`' postinstall from downloading native engine
// binaries (this project's adapter-better-sqlite3 path never loads one).
console.log("\nInstalling PRODUCTION-ONLY backend dependencies (npm ci --omit=dev --ignore-scripts)...");
run("npm ci --omit=dev (prod-only backend deps)", prodBackendDir, [
  "ci",
  "--omit=dev",
  "--ignore-scripts",
]);

// Step 6: delete the dev-tooling that survives `--omit=dev` solely because
// `@prisma/client` peer-depends on `prisma` and `typescript` (see file header
// for why this is safe — neither is `require()`d anywhere in the runtime
// closure once Prisma codegen has already happened at build time).
const prodNodeModules = path.join(prodBackendDir, "node_modules");
const peerDepOnlyDevTooling = [
  "prisma",
  "typescript",
  path.join("@prisma", "engines"),
  path.join("@prisma", "engines-version"),
  path.join("@prisma", "fetch-engine"),
  path.join("@prisma", "get-platform"),
];
console.log("\nRemoving peer-dependency-only dev tooling that survived --omit=dev:");
for (const rel of peerDepOnlyDevTooling) {
  const p = path.join(prodNodeModules, rel);
  if (existsSync(p)) {
    console.log(`  node_modules/${rel.split(path.sep).join("/")}`);
    rmSync(p, { recursive: true, force: true });
  }
}

// Step 6b (Lever 1 — SN-5 bundle+harden pass, safe size wins): delete deps
// that are ORPHANED or INERT once `prisma` (the CLI) and the peer-dep-only
// tooling above are already gone:
//   - "effect" (~31MB) + "@prisma/config" — only reachable via
//     `@prisma/client -> prisma -> @prisma/config -> effect`. `prisma` itself
//     is already deleted above and is never `require()`d anywhere in
//     `dist/**` (confirmed by grep — this project's adapter-better-sqlite3 /
//     adapter-pg driver-adapter path never shells out to the Prisma CLI at
//     runtime, only at build time), so both are dead weight.
//   - the STAGED backend's own "better-sqlite3-multiple-ciphers" (~14MB) —
//     INERT. The desktop's launcher.ts always injects a `--require` hook
//     (scripts/electron-native-require-hook.cjs) that redirects
//     `require("better-sqlite3-multiple-ciphers")` to the desktop-owned,
//     Electron ABI-146 copy under `native/node_modules` (see
//     resource-paths.ts / rebuild-native-backend.mjs) BEFORE Node's normal
//     resolution runs, for every child this backend is ever spawned as
//     (the store-node server AND the schema-push one-shot). The backend's
//     own copy here is built for plain Node, not Electron's ABI, and is
//     never the one actually loaded — it's the reason WATCH-SN4-1 exists in
//     the first place. Deleting it does not touch the require() CALL sites
//     (`node_modules/better-sqlite3`'s sqlcipher-shim still does
//     `require("better-sqlite3-multiple-ciphers")` — the hook intercepts
//     that exact specifier regardless of whether a same-named package
//     folder exists on disk here).
const orphanedOrInertProdDeps = [
  "effect",
  path.join("@prisma", "config"),
  "better-sqlite3-multiple-ciphers",
];
console.log("\nRemoving orphaned/inert production deps (Lever 1 — see file header):");
for (const rel of orphanedOrInertProdDeps) {
  const p = path.join(prodNodeModules, rel);
  if (existsSync(p)) {
    console.log(`  node_modules/${rel.split(path.sep).join("/")}`);
    rmSync(p, { recursive: true, force: true });
  }
}

// Step 7: flatten + dereference the pruned backend into the FINAL staging dir
// electron-builder actually packages (unchanged consumer: extraResources'
// `.staging/backend` -> `backend`; main.ts's resolveStoreNodeResourcePaths()
// reads this back as `<resourcesPath>/backend` when app.isPackaged).
console.log(`\nFlattening production backend -> ${stagingDir}`);
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
for (const sub of ["dist", "node_modules", "prisma"]) {
  const src = path.join(prodBackendDir, sub);
  requireExists(src, "prod-build step did not produce this — see the npm ci output above");
  console.log(`  copying ${sub}/ (dereferencing symlinks)...`);
  cpSync(src, path.join(stagingDir, sub), { recursive: true, dereference: true });
}

// Step 8: the scratch prod-build dir is a computation aid, not a shipped
// artifact — drop it now that it's been flattened into stagingDir.
rmSync(prodBuildDir, { recursive: true, force: true });

console.log(
  `\nBackend resources staged at ${stagingDir}:\n` +
    "  dist/          — compiled server + both generated Prisma clients (postgres + sqlite)\n" +
    "  node_modules/  — PRODUCTION-ONLY dependency closure (npm ci --omit=dev, peer-dep-only\n" +
    "                   prisma/typescript/@prisma/engines* pruned — see file header)\n" +
    "  prisma/        — schema.sqlite.prisma + the pre-generated sqlite-schema.sql DDL\n",
);

// Step 9 (Lever 2 — SN-5 bundle+harden pass): bundle+minify dist/server.js
// into a single server.bundle.cjs (see scripts/bundle-backend.mjs's header
// for the full externalization rationale), then delete the loose dist/**
// app code + node_modules packages the bundle made redundant.
// resource-paths.ts's resolveStoreNodeResourcePaths() points the PACKAGED
// spawn at this file instead of dist/server.js; dev keeps using dist/server.js
// directly (unbundled), so this step only affects packaged builds.
//
// RXPOS_SKIP_OBFUSCATE=1 ships the minified-but-unobfuscated bundle (still
// far less readable than loose source) — an escape hatch if obfuscation ever
// regresses startup/runtime behavior; obfuscation is ON by default.
const skipObfuscate = process.env.RXPOS_SKIP_OBFUSCATE === "1";
console.log(`\nBundling backend server -> server.bundle.cjs (obfuscate: ${!skipObfuscate})...`);
const { bundleBackend } = await import("./bundle-backend.mjs");
const bundleStats = await bundleBackend(stagingDir, { obfuscate: !skipObfuscate });
console.log(
  `  wrote ${bundleStats.outfile} (obfuscated: ${bundleStats.obfuscated})\n` +
    `  kept ${bundleStats.unsafeClosureSize} node_modules packages external (native/__dirname-sensitive closure)\n` +
    `  deleted ${bundleStats.deletedDistFiles} now-inlined dist/** files\n` +
    `  deleted ${bundleStats.deletedNodeModulesPkgs.length} now-inlined node_modules packages: ` +
    `${bundleStats.deletedNodeModulesPkgs.join(", ")}\n`,
);
if (bundleStats.unexpectedKept.length > 0) {
  console.warn(
    `  WARNING: ${bundleStats.unexpectedKept.length} dist/** file(s) were neither inlined into the ` +
      "bundle nor in the always-external keep-list — left on disk defensively, investigate:\n" +
      bundleStats.unexpectedKept.map((f) => `    ${f}`).join("\n"),
  );
}
