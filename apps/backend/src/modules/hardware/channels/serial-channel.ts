// Real ByteChannel over a serial / USB-serial (virtual COM) port, backed by the
// `serialport` native module. Covers RS-232 devices and the large class of USB
// receipt printers / scales that expose a virtual COM port. The module is
// N-API (ABI-stable), so the same prebuilt binary loads under plain Node (the
// backend test suite) and Electron-as-node (the packaged store-node).
//
// Lazy-required so a backend process that never touches serial hardware (e.g.
// most tests / the cloud deployment) doesn't pay to load the native binding,
// and a missing binary degrades to a clear per-call error instead of a boot
// crash.
import type { ByteChannel } from "rx-pos-shared";

export interface SerialChannelOptions {
  /** COM port / device path, e.g. "COM3" or "/dev/ttyUSB0". */
  path: string;
  baudRate: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: "none" | "even" | "odd" | "mark" | "space";
  /** Fail the open if the port doesn't come up in this window. */
  openTimeoutMs?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSerialPort(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("serialport");
  return mod.SerialPort;
}

/** Open a serial port and adapt it to the shared ByteChannel interface. */
export async function openSerialChannel(opts: SerialChannelOptions): Promise<ByteChannel> {
  const SerialPort = loadSerialPort();
  const openTimeoutMs = opts.openTimeoutMs ?? 5000;

  const port = await new Promise<any>((resolve, reject) => {
    // eslint-disable-next-line prefer-const
    let timer: NodeJS.Timeout;
    const p = new SerialPort(
      {
        path: opts.path,
        baudRate: opts.baudRate,
        dataBits: opts.dataBits ?? 8,
        stopBits: opts.stopBits ?? 1,
        parity: opts.parity ?? "none",
        autoOpen: true,
      },
      (err: Error | null) => {
        clearTimeout(timer);
        if (err) reject(new Error(`serial open ${opts.path}: ${err.message}`));
        else resolve(p);
      },
    );
    timer = setTimeout(
      () => reject(new Error(`serial open ${opts.path} timed out after ${openTimeoutMs}ms`)),
      openTimeoutMs,
    );
  });

  return {
    write(bytes: Uint8Array): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        port.write(Buffer.from(bytes), (err: Error | null | undefined) => {
          if (err) return reject(err);
          // Flush the OS/driver buffer so a subsequent close() can't drop bytes
          // mid-print (receipt/cut/kick must fully leave before we hang up).
          port.drain((derr: Error | null | undefined) =>
            derr ? reject(derr) : resolve(),
          );
        });
      });
    },
    onData(cb: (chunk: Uint8Array) => void): () => void {
      const handler = (chunk: Buffer): void => cb(new Uint8Array(chunk));
      port.on("data", handler);
      return () => port.off("data", handler);
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!port.isOpen) return resolve();
        port.close(() => resolve());
      });
    },
  };
}
