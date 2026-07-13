// Hardware Abstraction Layer (HAL) contract. One contract, satisfied by the
// Electron bridge, the web/PWA implementation, and the station-host relay.
// Phase 2.9. No I/O lives here — this file is types only.

export type Transport = "network" | "native" | "relay";
export type DeviceKind = "printer" | "drawer" | "scale" | "scanner";
export type DeviceStatus =
  | "connected"
  | "error"
  | "offline"
  | "paper-out"
  | "unknown";

/** How a device is physically reached. Discriminated by `kind`. */
export type ConnectionSpec =
  | { kind: "network"; ip: string; port: number }
  | { kind: "usb"; usbVendorId: number; usbProductId: number }
  | { kind: "serial"; serialPath: string; baudRate: number };

export type ScaleProtocol = "nci" | "hid" | "network";

/** Persisted device configuration (Driver Panel → backend DeviceProfile). */
export interface DeviceProfile {
  id: string;
  storeId: string;
  kind: DeviceKind;
  label: string;
  connection: ConnectionSpec;
  /** Station that physically owns a usb/serial device; null for network devices. */
  ownerStationId: string | null;
  /** Scale wire protocol; undefined for non-scale devices. */
  protocol?: ScaleProtocol;
  config?: Record<string, unknown>;
}

/** Live view of a device for listDevices()/status. */
export interface DeviceInfo {
  id: string;
  kind: DeviceKind;
  label: string;
  transport: Transport;
  ownerStationId: string | null;
  status: DeviceStatus;
  detail?: string;
}

export interface ReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
}

export interface ReceiptJob {
  header?: ReceiptLine[];
  lines: ReceiptLine[];
  /** 1D barcode payload (e.g. invoice number). Rendered as CODE39 in 2.9.0. */
  barcode?: string;
  /** QR payload. Field defined in 2.9.0; rendered by the printer driver in 2.9.1. */
  qr?: string;
  /** Raster logo/image: width in BYTES per row, height in dots, bitmap bytes. */
  logo?: { width: number; height: number; data: number[] };
  cut?: boolean;
  openDrawer?: boolean;
}

export interface WeightReading {
  value: number;
  unit: "g" | "kg" | "lb" | "oz";
  stable: boolean;
  tare?: number;
}

export interface HardwareResult {
  ok: boolean;
  reason?: string;
}

/** The single contract every HAL implementation satisfies. */
export interface HardwareHAL {
  listDevices(): Promise<DeviceInfo[]>;
  testDevice(id: string): Promise<HardwareResult>;
  printReceipt(job: ReceiptJob, deviceId?: string): Promise<HardwareResult>;
  openCashDrawer(deviceId?: string): Promise<HardwareResult>;
  readWeight(deviceId?: string): Promise<WeightReading>;
  onWeightStream(deviceId: string, cb: (r: WeightReading) => void): () => void;
  onDeviceStatus(cb: (d: DeviceInfo) => void): () => void;
}
