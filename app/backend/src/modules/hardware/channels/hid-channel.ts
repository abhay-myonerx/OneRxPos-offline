// Real ByteChannel over a raw USB-HID device, backed by the `node-hid` native
// module (N-API, same binary under Node + Electron). For HID peripherals that
// are NOT keyboard-wedge — e.g. some scales and non-keyboard scanners, and the
// occasional HID-class receipt printer. Keyboard-wedge scanners need nothing
// here (they type into the focused field; the frontend already handles them).
//
// Lazy-required for the same reasons as the serial channel.
import type { ByteChannel } from "rx-pos-shared";

export interface HidChannelOptions {
  vendorId: number;
  productId: number;
  /** Some device path when vendor/product is ambiguous (multiple identical units). */
  path?: string;
  /**
   * Report-ID byte prepended to each write. Many HID devices require a leading
   * report id (commonly 0). Device-specific; defaults to 0.
   */
  reportId?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadHid(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("node-hid");
}

/** Open a USB-HID device and adapt it to the shared ByteChannel interface. */
export async function openHidChannel(opts: HidChannelOptions): Promise<ByteChannel> {
  const HID = loadHid();
  let device: any;
  try {
    device = opts.path ? new HID.HID(opts.path) : new HID.HID(opts.vendorId, opts.productId);
  } catch (err) {
    throw new Error(
      `HID open ${opts.vendorId}:${opts.productId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const reportId = opts.reportId ?? 0;

  return {
    write(bytes: Uint8Array): Promise<void> {
      // node-hid's write is synchronous and throws on failure.
      return new Promise<void>((resolve, reject) => {
        try {
          device.write([reportId, ...Array.from(bytes)]);
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },
    onData(cb: (chunk: Uint8Array) => void): () => void {
      const handler = (data: Buffer): void => cb(new Uint8Array(data));
      device.on("data", handler);
      return () => device.removeListener("data", handler);
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        try {
          device.close();
        } catch {
          /* already closed */
        }
        resolve();
      });
    },
  };
}
