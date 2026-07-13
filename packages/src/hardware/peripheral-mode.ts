// Peripheral mode + config (Phase 2.10). Each device is independently
// mock/hardware; a global PERIPHERAL_MODE applies unless a device overrides it.

export type PeripheralMode = "mock" | "hardware";

/**
 * Resolve a device's effective mode: per-device wins, then the global override,
 * then the safe production default ("hardware" — a configured device is real
 * unless explicitly mocked). Dev/CI sets the global override to "mock".
 */
export function resolveMode(
  deviceMode: PeripheralMode | undefined,
  globalMode: PeripheralMode | undefined,
): PeripheralMode {
  return deviceMode ?? globalMode ?? "hardware";
}

/** Config for one peripheral (mirrors HARDWARE_INTEGRATION_SPEC §1.1). */
export interface PeripheralDeviceConfig {
  mode?: PeripheralMode;
  profile: string;
  host?: string;
  port?: number;
  comPort?: string;
  baud?: number;
  kickPin?: 2 | 5;
}

export interface PeripheralsConfig {
  scanner?: PeripheralDeviceConfig;
  printer?: PeripheralDeviceConfig;
  drawer?: PeripheralDeviceConfig;
  terminal?: PeripheralDeviceConfig;
  scale?: PeripheralDeviceConfig;
}
