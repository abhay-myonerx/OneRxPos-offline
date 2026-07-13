import path from "node:path";
import { expect, it } from "vitest";
import { resolveStoreNodeResourcePaths } from "../../src/store-node/resource-paths";

it("dev (unpackaged): resolves backendDir as the sibling rx-pos-backend checkout, native/scripts under appPath", () => {
  const result = resolveStoreNodeResourcePaths({
    isPackaged: false,
    appPath: "/repo/rx-pos-desktop",
    resourcesPath: "/should-be-ignored/resources",
  });

  expect(result).toEqual({
    backendDir: path.resolve("/repo/rx-pos-desktop", "..", "rx-pos-backend"),
    nativeDir: path.join("/repo/rx-pos-desktop", "native", "node_modules"),
    hookPath: path.join(
      "/repo/rx-pos-desktop",
      "scripts",
      "electron-native-require-hook.cjs",
    ),
    oneShotScriptPath: path.join(
      "/repo/rx-pos-desktop",
      "scripts",
      "push-sqlite-schema-oneshot.cjs",
    ),
    sqlcipherEntry: path.join(
      "/repo/rx-pos-desktop",
      "native",
      "node_modules",
      "better-sqlite3-multiple-ciphers",
    ),
    // SN-5 bundle+harden pass: dev runs the plain tsc build output directly
    // (no bundling step in the inner dev loop) — see resource-paths.ts's
    // serverEntry doc comment.
    serverEntry: path.join(
      path.resolve("/repo/rx-pos-desktop", "..", "rx-pos-backend"),
      "dist",
      "server.js",
    ),
  });
});

it("packaged: resolves every path under process.resourcesPath, not app.getAppPath() (which is inside app.asar)", () => {
  const result = resolveStoreNodeResourcePaths({
    isPackaged: true,
    appPath: "/install/resources/app.asar",
    resourcesPath: "/install/resources",
  });

  expect(result).toEqual({
    backendDir: path.join("/install/resources", "backend"),
    nativeDir: path.join("/install/resources", "native", "node_modules"),
    hookPath: path.join(
      "/install/resources",
      "scripts",
      "electron-native-require-hook.cjs",
    ),
    oneShotScriptPath: path.join(
      "/install/resources",
      "scripts",
      "push-sqlite-schema-oneshot.cjs",
    ),
    sqlcipherEntry: path.join(
      "/install/resources",
      "native",
      "node_modules",
      "better-sqlite3-multiple-ciphers",
    ),
    // SN-5 bundle+harden pass: packaged runs the bundled/minified/
    // obfuscated server.bundle.cjs, not the loose dist/server.js the
    // packaging step deletes — see resource-paths.ts's serverEntry doc
    // comment.
    serverEntry: path.join("/install/resources", "backend", "server.bundle.cjs"),
  });

  // Never derived from appPath once packaged.
  expect(result.backendDir).not.toContain("app.asar");
});

it("packaged backendDir does not depend on appPath at all (only resourcesPath)", () => {
  const a = resolveStoreNodeResourcePaths({
    isPackaged: true,
    appPath: "/one/resources/app.asar",
    resourcesPath: "/shared/resources",
  });
  const b = resolveStoreNodeResourcePaths({
    isPackaged: true,
    appPath: "/completely/different/resources/app.asar",
    resourcesPath: "/shared/resources",
  });
  expect(a).toEqual(b);
});
