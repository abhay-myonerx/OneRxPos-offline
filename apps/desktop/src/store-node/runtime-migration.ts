import path from "node:path";
import { copyFileSync, existsSync, renameSync } from "node:fs";

import type { StoreNodeRuntimePaths } from "./runtime-paths";

export function migrateLegacyStoreNodeDatabase(
  userDataDir: string,
  runtimePaths: StoreNodeRuntimePaths,
): void {
  const legacyDbPath = path.join(userDataDir, "store-node.db");

  if (!existsSync(legacyDbPath)) {
    return;
  }

  if (existsSync(runtimePaths.dbPath)) {
    return;
  }

  try {
    renameSync(legacyDbPath, runtimePaths.dbPath);
  } catch {
    copyFileSync(legacyDbPath, runtimePaths.dbPath);
  }

  migrateSidecar(`${legacyDbPath}-wal`, `${runtimePaths.dbPath}-wal`);

  migrateSidecar(`${legacyDbPath}-shm`, `${runtimePaths.dbPath}-shm`);
}

function migrateSidecar(source: string, destination: string): void {
  if (!existsSync(source)) {
    return;
  }

  if (existsSync(destination)) {
    return;
  }

  try {
    renameSync(source, destination);
  } catch {
    copyFileSync(source, destination);
  }
}
