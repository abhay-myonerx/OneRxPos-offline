// Enumerate locally-attached peripherals so the settings UI can offer a
// dropdown of detected devices instead of hand-typed COM ports / USB ids.
// Each enumerator is isolated + fail-soft: if a native module can't load (e.g.
// a cloud deployment with no hardware stack), that category returns empty
// rather than failing the whole request.
import { listWindowsPrinters } from "./channels/windows-printer";

export interface DiscoveredSerialPort {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export interface DiscoveredHidDevice {
  vendorId: number;
  productId: number;
  path?: string;
  product?: string;
  manufacturer?: string;
}

export interface DiscoveredDevices {
  serial: DiscoveredSerialPort[];
  hid: DiscoveredHidDevice[];
  /** Installed Windows printer-queue names (raw-spooler transport targets). */
  printers: string[];
}

async function listSerialPorts(): Promise<DiscoveredSerialPort[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SerialPort } = require("serialport");
    const ports = await SerialPort.list();
    return ports.map(
      (p: {
        path: string;
        manufacturer?: string;
        serialNumber?: string;
        vendorId?: string;
        productId?: string;
      }) => ({
        path: p.path,
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId,
      }),
    );
  } catch {
    return [];
  }
}

function listHidDevices(): DiscoveredHidDevice[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const HID = require("node-hid");
    const devices = HID.devices() as Array<{
      vendorId: number;
      productId: number;
      path?: string;
      product?: string;
      manufacturer?: string;
    }>;
    return devices.map((d) => ({
      vendorId: d.vendorId,
      productId: d.productId,
      path: d.path,
      product: d.product,
      manufacturer: d.manufacturer,
    }));
  } catch {
    return [];
  }
}

export async function discoverDevices(): Promise<DiscoveredDevices> {
  const [serial, hid, printers] = await Promise.all([
    listSerialPorts(),
    Promise.resolve(listHidDevices()),
    listWindowsPrinters().catch(() => [] as string[]),
  ]);
  return { serial, hid, printers };
}
