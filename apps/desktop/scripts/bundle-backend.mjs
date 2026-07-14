// SN-5 "bundle+harden" pass, Lever 2. Bundles the STAGED backend's
// `dist/server.js` into a single minified (optionally obfuscated) CJS file —
// `server.bundle.cjs`, sitting at the staged backend's root — then deletes
// the now-redundant loose `dist/**` app-code files and node_modules packages
// that ended up fully inlined. Invoked by prepare-backend-resources.mjs AFTER
// the production node_modules install + flatten (operates on the FINAL
// `.staging/backend` dir, so the relative-path math below, computed against
// `server.bundle.cjs`'s real final location, is exact).
//
// WHAT STAYS EXTERNAL (real, untouched files/packages — never inlined) AND WHY:
//
//   1. Native-binding packages (can't be inlined — they load a compiled
//      `.node` addon): "better-sqlite3-multiple-ciphers" (redirected by
//      launcher.ts's `--require` hook to the desktop's own Electron-ABI
//      copy — see WATCH-SN4-1; the staged copy is deleted by Lever 1
//      regardless, but the require() TEXT must stay literal for the hook to
//      intercept it), "better-sqlite3" (the sqlcipher-shim wrapper, tiny,
//      itself does `require("better-sqlite3-multiple-ciphers")`), "argon2",
//      "msgpackr-extract" (+ its scoped per-platform prebuild packages).
//
//   2. Packages with their OWN `__dirname`-relative runtime file access,
//      which bundling would silently break by collapsing every inlined
//      module's `__dirname` down to the bundle's single output location:
//        - "@prisma/client" + "@prisma/adapter-better-sqlite3" +
//          "@prisma/adapter-pg" — Prisma's generated client
//          (`dist/generated/prisma*/client.js`) does
//          `getPrismaClientClass(__dirname)` and resolves its query-engine
//          binary/WASM relative to that same `__dirname` (verified by
//          grepping the generated client — see the "generated Prisma
//          clients" bullet below for the actual FILES, which are backend
//          `dist/**` output, not node_modules, but load-bearing on the same
//          `__dirname` mechanism).
//        - "pino" / "pino-pretty" — pino's transport machinery
//          (`lib/transport.js`) spawns a worker thread that loads the
//          transport module by a `__dirname`-relative path. Inert in this
//          app (launcher.ts always sets `NODE_ENV=production`, and
//          `logger.ts` only wires the `pino-pretty` transport when
//          `NODE_ENV==="development"`), but kept external anyway — zero
//          reward for the bundling risk.
//        - "socket.io" — serves its own bundled client script
//          (`client-dist/socket.io.js`) via a `__dirname`-relative
//          `fs.createReadStream`/`path.join`.
//        - "ioredis" — reads its own `package.json` via a
//          `__dirname`-relative `path.resolve` (utils/index.js).
//        - "bullmq" (depends on "ioredis" + "msgpackr" anyway — kept
//          together as one family for simplicity) and "msgpackr" itself
//          (its optional native-acceleration path does
//          `require("msgpackr-extract")`, which is bullet #1's tree).
//
//      Everything ELSE these packages require, transitively, is pulled into
//      the "unsafe closure" below programmatically (via each unsafe root's
//      OWN package.json `dependencies`/`optionalDependencies`) rather than
//      hand-enumerated — so a shared sub-dependency (e.g. "cors"/"accepts",
//      needed by BOTH express, which we bundle, AND socket.io/engine.io,
//      which we don't) is correctly kept on disk rather than deleted out
//      from under the external package that still needs it.
//
//   3. Specific `dist/**` FILES that must keep a single, stable identity —
//      matched by absolute resolved path, REGARDLESS of which module
//      imports them, so every importer (whether itself inlined into the
//      bundle or also external) resolves to the exact same on-disk file:
//        - `dist/generated/prisma/**`, `dist/generated/prisma-sqlite/**` —
//          see bullet #2's `__dirname` note; this is the actual generated
//          client CODE (backend build output), as opposed to the
//          `@prisma/client` RUNTIME package it's built against.
//        - `dist/config/database.js` — constructs the Prisma Client
//          singleton via `globalForPrisma.prisma ?? createPrismaClient()`,
//          but the `NODE_ENV !== "production"` guard means the
//          globalThis-cache write is SKIPPED in production (this app's
//          store-node always runs with `NODE_ENV=production` —
//          launcher.ts). If this file were inlined into the bundle AND ALSO
//          left as a loose file reachable from `dist/sync/store-node/
//          outbox-drainer.js` below, Node's require() cache (keyed by
//          resolved absolute path) would treat them as two DIFFERENT
//          modules, silently double-instantiating the PrismaClient / SQLite
//          adapter connection — a real behavior change, not just a size
//          regression. Keeping this one file external, for every importer
//          uniformly, preserves the exact single-instance behavior the
//          unbundled backend already has today (same absolute path -> same
//          require() cache entry, whoever asks for it).
//        - `dist/config/index.js` — required directly BY database.js
//          (`require("./index")`); must exist on disk at that relative
//          location for database.js's own untouched require to resolve.
//          Also externalized for every OTHER importer for consistency (a
//          duplicated zod-parsed config object would be harmless — it's
//          side-effect-free — but there's no reason to duplicate it either).
//        - `dist/local/**` — sqlcipher-adapter.js / key-derivation.js
//          (required by database.js), sync-triggers.js / event-crypto.js
//          (required by outbox-drainer.js below), sqlite-push.js (NOT
//          reached by server.js's graph at all — only by the SEPARATE
//          schema-push one-shot, scripts/push-sqlite-schema-oneshot.cjs,
//          which is intentionally left pointed at this loose file rather
//          than bundled — see that script's own comment for why: its
//          `DEFAULT_DDL_SQL_PATH` is computed via `resolve(__dirname, "..",
//          "..", "prisma", "sqlite-schema.sql")`, the same __dirname-
//          collapse hazard as bullet #2). Kept as a whole directory rather
//          than cherry-picked — small (~230KB unbundled), low value to
//          split further, and this guarantees nothing in this tightly-
//          coupled cluster is missed.
//        - `dist/sync/outbox.js`, `dist/sync/store-node/outbox-drainer.js`
//          — outbox-drainer.js is reached from `server.js` (via
//          `sync/store-node/drain-scheduler.js`, which itself DOES get
//          inlined — only the leaf file with the `__dirname` computation is
//          externalized) and independently does
//          `REPO_ROOT = resolve(__dirname, "..", "..", "..")` to locate
//          `prisma/schema.sqlite.prisma` — same __dirname hazard as
//          sqlite-push.js above.
//
// Everything else under `dist/**` (server.js, app.js, all of modules/,
// middleware/, sectors/, socket/, jobs/, licensing/, lib/, shared/,
// config/redis.js, config/queue.js, the rest of sync/**) is free of any
// __dirname/native landmine (verified: only 3 files in the ENTIRE backend
// dist tree reference `__dirname` at all —
// local/sqlite-push.js, modules/drug/dpd-import.service.js [not even
// reached from server.js's require graph], and sync/store-node/
// outbox-drainer.js, all three handled above) — so it's bundled, minified,
// and (optionally) obfuscated into `server.bundle.cjs`, and the loose
// source deleted afterward.
import { build } from "esbuild";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// ── 1. Bare-package externals (kept as real node_modules packages) ────────
const UNSAFE_ROOT_PACKAGES = [
  "better-sqlite3-multiple-ciphers",
  "better-sqlite3",
  "argon2",
  "msgpackr-extract",
  "@prisma/client",
  "@prisma/adapter-better-sqlite3",
  "@prisma/adapter-pg",
  // Explicitly protect the complete Prisma driver-adapter runtime chain.
  // @prisma/adapter-pg -> @prisma/driver-adapter-utils -> @prisma/debug
  "@prisma/driver-adapter-utils",
  "@prisma/debug",
  "pino",
  "pino-pretty",
  "socket.io",
  "ioredis",
  "bullmq",
  // Kept external (NOT inlined into server.bundle.cjs) because the dist files
  // in `alwaysExternalPrefixes` below (config/index.js, config/database.js,
  // local/*, sync/*) run UN-bundled and `require("zod")` / `require("dotenv")`
  // at runtime — most importantly the first-run schema-push one-shot
  // (push-sqlite-schema-oneshot.cjs -> dist/local/sqlite-push.js ->
  // dist/config/index.js). If these were inlined, bundle-backend would delete
  // their node_modules copies and the packaged app would die on boot with
  // "Cannot find module 'zod'" before any window opens.
  "zod",
  "dotenv",
  // Local-hardware HAL native modules. Both are N-API (ABI-stable), so the
  // SAME prebuilt .node loads under plain Node (backend tests, ABI 137) AND
  // Electron-as-node (packaged store-node, ABI 146) — no private per-ABI copy
  // or require-hook needed (unlike better-sqlite3-multiple-ciphers). Kept
  // external because their binding loaders (node-gyp-build / node-hid) resolve
  // the prebuilt binary by __dirname at runtime, which esbuild can't inline.
  "serialport",
  "@serialport/bindings-cpp",
  "node-hid",
];

// Computes the FULL transitive dependency closure of the unsafe roots above,
// walking each package's OWN package.json (dependencies + optionalDependencies)
// against the staged, flattened node_modules — not a hand-maintained list, so
// it can't silently drift from what these packages actually require at
// runtime (mirrors prepare-backend-resources.mjs's own "trust npm's resolver,
// not a hand-picked list" philosophy).
function computeUnsafeClosure(roots, nodeModulesDir) {
  const closure = new Set();
  const queue = [...roots];

  while (queue.length > 0) {
    const name = queue.shift();

    if (!name || closure.has(name)) {
      continue;
    }

    const pkgJsonPath = path.join(nodeModulesDir, name, "package.json");

    // Optional/platform-specific package not installed for this target.
    if (!existsSync(pkgJsonPath)) {
      continue;
    }

    closure.add(name);

    let pkg;

    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    } catch (error) {
      throw new Error(
        `computeUnsafeClosure: failed to parse ${pkgJsonPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const runtimeDependencies = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    };

    for (const dependencyName of Object.keys(runtimeDependencies)) {
      if (!closure.has(dependencyName)) {
        queue.push(dependencyName);
      }
    }

    // Preserve installed peers that an external package may load at runtime.
    for (const peerName of Object.keys(pkg.peerDependencies ?? {})) {
      const peerPackageJsonPath = path.join(
        nodeModulesDir,
        peerName,
        "package.json",
      );

      if (
        existsSync(peerPackageJsonPath) &&
        !closure.has(peerName)
      ) {
        queue.push(peerName);
      }
    }
  }

  return closure;
}

// ── 2. Specific dist/** files/dirs always kept external, by absolute path ──
function alwaysExternalPrefixes(distDir) {
  return [
    path.join(distDir, "generated") + path.sep,
    path.join(distDir, "local") + path.sep,
    path.join(distDir, "config", "database.js"),
    path.join(distDir, "config", "index.js"),
    path.join(distDir, "sync", "outbox.js"),
    path.join(distDir, "sync", "store-node", "outbox-drainer.js"),
  ];
}

function alwaysExternalPlugin(prefixes, outputFile) {
  return {
    name: "rxpos-always-external",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        // Only intercept relative/absolute (file-system) specifiers — bare
        // package names are handled by esbuild's own `external` option
        // (populated from the unsafe closure below).
        if (!args.path.startsWith(".") && !path.isAbsolute(args.path)) return null;
        if (args.kind === "entry-point") return null;

        let resolved = path.resolve(args.resolveDir, args.path);
        if (!existsSync(resolved)) {
          if (existsSync(`${resolved}.js`)) resolved = `${resolved}.js`;
          else return null; // let esbuild's default resolver handle it (.json, index.js, etc.)
        }

        const matched = prefixes.some((p) => resolved === p || resolved.startsWith(p));
        if (!matched) return null;

        const rel = path.relative(path.dirname(outputFile), resolved).split(path.sep).join("/");
        return { path: rel.startsWith(".") ? rel : `./${rel}`, external: true };
      });
    },
  };
}

// ── 3. Recursive file collection + empty-dir pruning helpers ──────────────
function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(p));
    else out.push(p);
  }
  return out;
}

function pruneEmptyDirs(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyDirs(path.join(dir, entry.name));
  }
  if (readdirSync(dir).length === 0) rmSync(dir, { recursive: true, force: true });
}

/**
 * Bundles `<stagingDir>/dist/server.js` -> `<stagingDir>/server.bundle.cjs`
 * (minified CJS, no source maps), then deletes the loose `dist/**` files and
 * node_modules packages the bundle made redundant. Returns bundling stats for
 * the caller to log/report.
 */
export async function bundleBackend(stagingDir, opts = {}) {
  const obfuscate = opts.obfuscate ?? false;
  const distDir = path.join(stagingDir, "dist");
  const nodeModulesDir = path.join(stagingDir, "node_modules");
  const entry = path.join(distDir, "server.js");
  const outfile = path.join(stagingDir, "server.bundle.cjs");

  if (!existsSync(entry)) {
    throw new Error(`bundleBackend: entry point not found at ${entry}`);
  }

  const unsafeClosure = computeUnsafeClosure(UNSAFE_ROOT_PACKAGES, nodeModulesDir);
  const prefixes = alwaysExternalPrefixes(distDir);

  const result = await build({
    entryPoints: [entry],
    outfile,
    absWorkingDir: stagingDir,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    logLevel: "warning",
    metafile: true,
    external: [...unsafeClosure],
    plugins: [alwaysExternalPlugin(prefixes, outfile)],
  });

  // ── Optional hardening pass: obfuscate the already-minified bundle ──────
  let obfuscated = false;
  if (obfuscate) {
    const { default: JavaScriptObfuscator } = await import("javascript-obfuscator");
    const source = readFileSync(outfile, "utf8");
    const obfResult = JavaScriptObfuscator.obfuscate(source, {
      compact: true,
      controlFlowFlattening: false, // keep startup fast — this is a long-running server, not a one-shot script
      deadCodeInjection: false,
      stringArray: true,
      stringArrayEncoding: ["base64"],
      stringArrayThreshold: 0.75,
      identifierNamesGenerator: "mangled",
      renameGlobals: false,
      selfDefending: false, // avoid interfering with Node's own module wrapper / require semantics
      disableConsoleOutput: false,
    });
    writeFileSync(outfile, obfResult.getObfuscatedCode(), "utf8");
    obfuscated = true;
  }

  // ── Delete the now-redundant loose dist/** app code ─────────────────────
  const keepAbsolute = new Set();
  for (const keepDir of [path.join(distDir, "generated"), path.join(distDir, "local")]) {
    for (const f of collectFiles(keepDir)) {
      // Even inside a "keep the whole directory" tree, .map files (source
      // maps — always stripped) and __tests__/** (vitest specs compiled by
      // tsc alongside src/**, never require()d by any production code path)
      // are unconditionally dead weight — fall through to the generic
      // isTestOrMap deletion pass below instead of blanket-keeping them.
      if (f.endsWith(".map") || /[\\/]__tests__[\\/]/.test(f)) continue;
      keepAbsolute.add(f);
    }
  }
  for (const f of [
    path.join(distDir, "config", "database.js"),
    path.join(distDir, "config", "index.js"),
    path.join(distDir, "sync", "outbox.js"),
    path.join(distDir, "sync", "store-node", "outbox-drainer.js"),
  ]) {
    if (existsSync(f)) keepAbsolute.add(f);
  }

  const inlinedAbsolute = new Set(
    Object.keys(result.metafile.inputs)
      .filter((p) => p.startsWith(`dist${path.sep}`) || p.startsWith("dist/"))
      .map((p) => path.resolve(stagingDir, p)),
  );

  // dist/test-env.js: a vitest `setupFiles` entry (src/test-env.ts, stamps
  // placeholder env vars before test modules load) — never require()d by
  // any production path (only test files reach it, and those are already
  // deleted below), so it's dead weight in a shipped bundle too.
  const alwaysDeleteBasenames = new Set(["test-env.js"]);

  let deletedDistFiles = 0;
  const unexpectedKept = [];
  for (const f of collectFiles(distDir)) {
    if (keepAbsolute.has(f)) continue;
    const isTestOrMap =
      /\.map$/.test(f) || /[\\/]__tests__[\\/]/.test(f) || alwaysDeleteBasenames.has(path.basename(f));
    if (inlinedAbsolute.has(f) || isTestOrMap) {
      rmSync(f, { force: true });
      deletedDistFiles++;
    } else {
      unexpectedKept.push(f);
    }
  }
  pruneEmptyDirs(distDir);

  // ── Delete node_modules packages that ended up fully inlined ───────────
  const inlinedPkgs = new Set();
  for (const p of Object.keys(result.metafile.inputs)) {
    const m = /^node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(p);
    if (m) inlinedPkgs.add(m[1].split(path.sep).join("/").replace(/\\/g, "/"));
  }
  const deletablePkgs = [...inlinedPkgs].filter(
    (packageName) => !unsafeClosure.has(packageName),
  );

  for (const packageName of deletablePkgs) {
    rmSync(path.join(nodeModulesDir, packageName), {
      recursive: true,
      force: true,
    });
  }

  // Fail the build before producing a broken installer if a critical external
  // runtime package was accidentally removed by the bundle/prune pass.
  const CRITICAL_RUNTIME_PACKAGES = [
    "@prisma/client",
    "@prisma/adapter-pg",
    "@prisma/adapter-better-sqlite3",
    "@prisma/driver-adapter-utils",
    "@prisma/debug",
    "zod",
    "dotenv",
  ];

  console.log(
    "\n[bundle-backend] Validating critical runtime dependencies...",
  );

  for (const packageName of CRITICAL_RUNTIME_PACKAGES) {
    const packageJsonPath = path.join(
      nodeModulesDir,
      packageName,
      "package.json",
    );

    if (!existsSync(packageJsonPath)) {
      throw new Error(
        [
          "bundleBackend: critical packaged runtime dependency missing.",
          "",
          `Package: ${packageName}`,
          `Expected: ${packageJsonPath}`,
          "",
          "The backend bundle/prune pass produced an invalid runtime dependency tree.",
        ].join("\n"),
      );
    }

    console.log(`[bundle-backend] OK node_modules/${packageName}`);
  }

  console.log(
    "[bundle-backend] Critical runtime dependency validation passed.\n",
  );

  return {
    outfile,
    obfuscated,
    unsafeClosureSize: unsafeClosure.size,
    deletedDistFiles,
    unexpectedKept,
    deletedNodeModulesPkgs: deletablePkgs.sort(),
    metafile: result.metafile,
  };
}
