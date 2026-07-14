import path from "node:path";
import { mkdirSync } from "node:fs";

export interface StoreNodeRuntimePaths {
  rootDir: string;
  dataDir: string;
  logsDir: string;
  runtimeDir: string;

  dbPath: string;
  bootLogPath: string;
}

export function resolveStoreNodeRuntimePaths(
  userDataDir: string,
): StoreNodeRuntimePaths {
  const rootDir = path.join(userDataDir, "store-node");

  const dataDir = path.join(rootDir, "data");
  const logsDir = path.join(rootDir, "logs");
  const runtimeDir = path.join(rootDir, "runtime");

  return {
    rootDir,
    dataDir,
    logsDir,
    runtimeDir,

    dbPath: path.join(dataDir, "store-node.db"),
    bootLogPath: path.join(logsDir, "store-node-boot.log"),
  };
}

export function ensureStoreNodeRuntimeDirectories(
  paths: StoreNodeRuntimePaths,
): void {
  mkdirSync(paths.rootDir, {
    recursive: true,
  });

  mkdirSync(paths.dataDir, {
    recursive: true,
  });

  mkdirSync(paths.logsDir, {
    recursive: true,
  });

  mkdirSync(paths.runtimeDir, {
    recursive: true,
  });
}
