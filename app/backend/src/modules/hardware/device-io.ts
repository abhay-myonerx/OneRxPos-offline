// Transport-agnostic peripheral I/O. Resolves a DeviceProfile connection to the
// right transport and performs print / drawer-kick / scale-read over it:
//   - network  -> existing TCP path (tcp-print / scale-read), untouched
//   - serial   -> serialport ByteChannel + shared drivers
//   - usb(hid) -> node-hid ByteChannel + shared drivers
// The shared drivers (printOverChannel / openDrawerOverChannel /
// readWeightOverChannel) render the exact same ESC/POS bytes as the network
// path, so a device behaves identically regardless of how it's wired.

import {
  renderReceipt,
  printOverChannel,
  openDrawerOverChannel,
  readWeightOverChannel,
  type ByteChannel,
  type ReceiptJob,
  type WeightReading,
} from "rx-pos-shared";
import { sendToPrinter } from "./tcp-print";
import { readNetworkScale } from "./scale-read";
import { openSerialChannel } from "./channels/serial-channel";
import { openHidChannel } from "./channels/hid-channel";
import { printRawToWindowsPrinter } from "./channels/windows-printer";

/** A resolved peripheral connection (mirrors the DeviceProfile connection union). */
export type DeviceConnection =
  | { kind: "network"; ip: string; port: number; timeoutMs?: number }
  | {
      kind: "serial";
      serialPath: string;
      baudRate: number;
      dataBits?: 5 | 6 | 7 | 8;
      stopBits?: 1 | 1.5 | 2;
      parity?: "none" | "even" | "odd" | "mark" | "space";
    }
  | { kind: "usb"; usbVendorId: number; usbProductId: number; path?: string; reportId?: number }
  | { kind: "windows-printer"; printerName: string };

/** Per-device presentation options, typically carried in DeviceProfile.config. */
export interface DeviceRenderOpts {
  commandSet?: "escpos" | "star";
  codepage?: string;
}

// A channel factory is injectable so the service layer can be unit-tested with a
// MockChannel — no real serial/USB hardware needed in CI (mirrors how the
// network path is tested against a TCP emulator).
export type ChannelFactory = (conn: DeviceConnection) => Promise<ByteChannel>;

async function realChannelFactory(conn: DeviceConnection): Promise<ByteChannel> {
  if (conn.kind === "serial") {
    return openSerialChannel({
      path: conn.serialPath,
      baudRate: conn.baudRate,
      dataBits: conn.dataBits,
      stopBits: conn.stopBits,
      parity: conn.parity,
    });
  }
  if (conn.kind === "usb") {
    return openHidChannel({
      vendorId: conn.usbVendorId,
      productId: conn.usbProductId,
      path: conn.path,
      reportId: conn.reportId,
    });
  }
  throw new Error(`no channel for connection kind "${(conn as { kind: string }).kind}"`);
}

let channelFactory: ChannelFactory = realChannelFactory;

/** Test seam: override the channel factory (e.g. to a MockChannel), returns a restore fn. */
export function setChannelFactory(factory: ChannelFactory): () => void {
  const prev = channelFactory;
  channelFactory = factory;
  return () => {
    channelFactory = prev;
  };
}

// The Windows raw-spooler printer spawns PowerShell, so it's injectable too —
// device-io tests assert the bytes without touching a real printer queue.
export type WindowsRawPrinter = (printerName: string, bytes: Uint8Array) => Promise<void>;
let windowsRawPrinter: WindowsRawPrinter = printRawToWindowsPrinter;

/** Test seam: override the Windows raw printer, returns a restore fn. */
export function setWindowsRawPrinter(fn: WindowsRawPrinter): () => void {
  const prev = windowsRawPrinter;
  windowsRawPrinter = fn;
  return () => {
    windowsRawPrinter = prev;
  };
}

/** Print a receipt job to a device on ANY transport. Rejects on failure. */
export async function printReceiptToDevice(
  job: ReceiptJob,
  conn: DeviceConnection,
  opts: DeviceRenderOpts = {},
): Promise<void> {
  if (conn.kind === "network") {
    await sendToPrinter(renderReceipt(job, { codepage: opts.codepage }), conn);
    return;
  }
  if (conn.kind === "windows-printer") {
    await windowsRawPrinter(conn.printerName, renderReceipt(job, { codepage: opts.codepage }));
    return;
  }
  const channel = await channelFactory(conn);
  try {
    await printOverChannel(channel, job, { commandSet: opts.commandSet, codepage: opts.codepage });
  } finally {
    await channel.close();
  }
}

/** Pop the cash drawer chained to the printer, on ANY transport. */
export async function openCashDrawerToDevice(
  conn: DeviceConnection,
  opts: DeviceRenderOpts = {},
): Promise<void> {
  if (conn.kind === "network") {
    await sendToPrinter(renderReceipt({ lines: [], openDrawer: true }), conn);
    return;
  }
  if (conn.kind === "windows-printer") {
    await windowsRawPrinter(conn.printerName, renderReceipt({ lines: [], openDrawer: true }));
    return;
  }
  const channel = await channelFactory(conn);
  try {
    await openDrawerOverChannel(channel, { commandSet: opts.commandSet });
  } finally {
    await channel.close();
  }
}

/** Read a live weight from a scale on ANY transport. */
export async function readWeightFromDevice(conn: DeviceConnection): Promise<WeightReading> {
  if (conn.kind === "network") {
    return readNetworkScale(conn);
  }
  const channel = await channelFactory(conn);
  try {
    return await readWeightOverChannel(channel);
  } finally {
    await channel.close();
  }
}
