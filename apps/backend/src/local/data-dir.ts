import path from "node:path";

const RX_POS_DATA_DIR_ENV = "RX_POS_DATA_DIR";

/**
 * Resolve the writable RX POS runtime data directory.
 *
 * Packaged Electron:
 *
 *   C:\Users\<user>\AppData\Roaming\rx-pos-desktop\data
 *
 * The Electron main process must provide RX_POS_DATA_DIR.
 *
 * Development / standalone backend:
 *
 *   <current-working-directory>/data
 *
 * IMPORTANT:
 *
 * Never derive mutable runtime data paths from __dirname.
 *
 * Packaged backend code lives under:
 *
 *   C:\Program Files\RX POS\resources\backend
 *
 * Program Files must be treated as read-only application resources.
 */
export function resolveRxPosDataDir(): string {
  const configuredDataDir = process.env[RX_POS_DATA_DIR_ENV]?.trim();

  if (configuredDataDir) {
    return path.resolve(configuredDataDir);
  }

  return path.resolve(process.cwd(), "data");
}

/**
 * Resolve a path relative to the RX POS writable data directory.
 */
export function resolveRxPosDataPath(...segments: string[]): string {
  return path.join(resolveRxPosDataDir(), ...segments);
}
