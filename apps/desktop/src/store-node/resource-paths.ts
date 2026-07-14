import path from "node:path";

export interface StoreNodeResourcePaths {
  backendDir: string;
  nativeDir: string;
  hookPath: string;
  oneShotScriptPath: string;
  sqlcipherEntry: string;
  serverEntry: string;
}

export interface ResolveStoreNodeResourcePathsOptions {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
}

export function resolveStoreNodeResourcePaths(
  opts: ResolveStoreNodeResourcePathsOptions,
): StoreNodeResourcePaths {
  const root = opts.isPackaged ? opts.resourcesPath : opts.appPath;

  const backendDir = opts.isPackaged
    ? path.join(opts.resourcesPath, "backend")
    : path.resolve(opts.appPath, "..", "backend");

  const nativeDir = opts.isPackaged
    ? path.join(opts.resourcesPath, "native", "node_modules")
    : path.join(opts.appPath, "native", "node_modules");

  const scriptsDir = opts.isPackaged
    ? path.join(opts.resourcesPath, "scripts")
    : path.join(opts.appPath, "scripts");

  return {
    backendDir,
    nativeDir,

    hookPath: path.join(scriptsDir, "electron-native-require-hook.cjs"),

    oneShotScriptPath: path.join(scriptsDir, "push-sqlite-schema-oneshot.cjs"),

    sqlcipherEntry: path.join(nativeDir, "better-sqlite3-multiple-ciphers"),

    serverEntry: opts.isPackaged
      ? path.join(backendDir, "server.bundle.cjs")
      : path.join(backendDir, "dist", "server.js"),
  };
}
