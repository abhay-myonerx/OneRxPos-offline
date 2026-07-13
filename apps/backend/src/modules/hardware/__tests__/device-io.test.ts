import { describe, it, expect } from "vitest";
import type { ByteChannel } from "rx-pos-shared";
import {
  printReceiptToDevice,
  openCashDrawerToDevice,
  readWeightFromDevice,
  setChannelFactory,
  setWindowsRawPrinter,
} from "../device-io";
import { makeEmulator } from "./printer-emulator";

// A MockChannel records everything written and can echo back a canned frame on
// write (for scale polling) — so serial/USB transports are testable with no
// physical hardware, mirroring how the network path is tested against a TCP
// emulator.
class MockChannel implements ByteChannel {
  written: number[] = [];
  closed = false;
  respondFrame?: string;
  private listeners: Array<(c: Uint8Array) => void> = [];
  async write(bytes: Uint8Array): Promise<void> {
    this.written.push(...bytes);
    if (this.respondFrame) {
      const frame = Uint8Array.from([...this.respondFrame].map((c) => c.charCodeAt(0)));
      queueMicrotask(() => this.listeners.forEach((l) => l(frame)));
    }
  }
  onData(cb: (c: Uint8Array) => void): () => void {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

const contains = (hay: number[], needle: number[]): boolean =>
  hay.some((_, i) => needle.every((b, j) => hay[i + j] === b));

describe("device-io — serial/USB transports", () => {
  it("serial print renders ESC/POS (init + cut) over the channel and closes it", async () => {
    const ch = new MockChannel();
    const restore = setChannelFactory(async () => ch);
    try {
      await printReceiptToDevice({ lines: [{ text: "HELLO" }], cut: true }, {
        kind: "serial",
        serialPath: "COM3",
        baudRate: 9600,
      });
    } finally {
      restore();
    }
    expect(ch.written.slice(0, 2)).toEqual([0x1b, 0x40]); // ESC @ init
    expect(contains(ch.written, [0x1d, 0x56, 0x00])).toBe(true); // GS V full cut
    expect(ch.closed).toBe(true);
  });

  it("usb (hid) print also routes through a channel", async () => {
    const ch = new MockChannel();
    const restore = setChannelFactory(async () => ch);
    try {
      await printReceiptToDevice({ lines: [{ text: "HI" }] }, {
        kind: "usb",
        usbVendorId: 0x04b8,
        usbProductId: 0x0e15,
      });
    } finally {
      restore();
    }
    expect(ch.written.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(ch.closed).toBe(true);
  });

  it("serial drawer sends the ESC p kick pulse", async () => {
    const ch = new MockChannel();
    const restore = setChannelFactory(async () => ch);
    try {
      await openCashDrawerToDevice({ kind: "serial", serialPath: "COM3", baudRate: 9600 });
    } finally {
      restore();
    }
    expect(contains(ch.written, [0x1b, 0x70, 0x00, 0x19, 0xfa])).toBe(true);
    expect(ch.closed).toBe(true);
  });

  it("windows-printer routes rendered ESC/POS bytes to the raw spooler", async () => {
    let sent: { printer: string; bytes: number[] } | null = null;
    const restore = setWindowsRawPrinter(async (printerName, bytes) => {
      sent = { printer: printerName, bytes: [...bytes] };
    });
    try {
      await printReceiptToDevice({ lines: [{ text: "WIN" }], cut: true }, {
        kind: "windows-printer",
        printerName: "EPSON TM-T88",
      });
    } finally {
      restore();
    }
    expect(sent).not.toBeNull();
    expect(sent!.printer).toBe("EPSON TM-T88");
    expect(sent!.bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(contains(sent!.bytes, [0x1d, 0x56, 0x00])).toBe(true);
  });

  it("windows-printer drawer sends a kick to the raw spooler", async () => {
    let bytes: number[] = [];
    const restore = setWindowsRawPrinter(async (_printer, b) => {
      bytes = [...b];
    });
    try {
      await openCashDrawerToDevice({ kind: "windows-printer", printerName: "EPSON TM-T88" });
    } finally {
      restore();
    }
    expect(contains(bytes, [0x1b, 0x70, 0x00, 0x19, 0xfa])).toBe(true);
  });

  it("serial scale polls and parses a weight frame", async () => {
    const ch = new MockChannel();
    ch.respondFrame = "ST 2.500 kg\r\n";
    const restore = setChannelFactory(async () => ch);
    let reading;
    try {
      reading = await readWeightFromDevice({ kind: "serial", serialPath: "COM3", baudRate: 9600 });
    } finally {
      restore();
    }
    expect(ch.written.slice(0, 2)).toEqual([0x57, 0x0d]); // "W\r" NCI poll
    expect(reading.value).toBeCloseTo(2.5, 3);
    expect(reading.unit).toBe("kg");
    expect(reading.stable).toBe(true);
    expect(ch.closed).toBe(true);
  });
});

describe("device-io — network transport (unchanged path)", () => {
  it("network print goes over TCP to a printer emulator", async () => {
    const emu = await makeEmulator();
    await printReceiptToDevice({ lines: [{ text: "NET" }] }, {
      kind: "network",
      ip: "127.0.0.1",
      port: emu.port,
    });
    const received = await emu.received;
    expect([...received.slice(0, 2)]).toEqual([0x1b, 0x40]); // reached the printer
  });
});
