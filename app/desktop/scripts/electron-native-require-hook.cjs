// SN-4 WATCH-SN4-1 fix, part 2 of 2 (see rebuild-native-backend.mjs for part 1).
//
// Injected into the spawned store-node child via `--require` (launcher.ts),
// ONLY when a private Electron-targeted copy of better-sqlite3-multiple-
// ciphers is available (rx-pos-desktop/native/, built by
// `npm run rebuild:native:backend`). Redirects ONLY
// `require("better-sqlite3-multiple-ciphers")` to that private copy's entry
// point, for this one child process — every other require() (including the
// rest of the backend's own compiled code) resolves completely normally.
//
// Why this exists: the backend's OWN node_modules copy of this native module
// is built for plain Node (so rx-pos-backend's own `npm test`/`npm run dev`
// work); the desktop spawns the backend under Electron-as-node (ABI 146), an
// ABI that copy doesn't match. This hook is the entire fix — no backend
// source or node_modules file is read, written, or modified.
"use strict";
// This file IS a CJS `--require` hook by construction; it must load
// synchronously via require() — an ESM import here would defeat the point.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");

const target = process.env.RXPOS_NATIVE_SQLCIPHER_ENTRY;

if (target) {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === "better-sqlite3-multiple-ciphers") {
      return originalResolveFilename.call(this, target, ...rest);
    }
    return originalResolveFilename.call(this, request, ...rest);
  };
}
