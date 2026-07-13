// Protocol-accurate TCP peripheral emulators for end-to-end hardware tests.
//
// The core principle from HARDWARE_INTEGRATION_SPEC.md §0: our software never
// talks to "a printer" — it talks to a PROTOCOL over a TRANSPORT. If our
// emulator receives the exact same bytes a real device would (ESC/POS over
// TCP :9100), then a real Epson/Star printer at the same host:port is a
// drop-in replacement. These emulators let the packaged app prove the wired
// hardware path with zero physical devices, so install-day is a config swap.

import net from "node:net";

export interface EscposEmulator {
  port: number;
  /** All bytes received across every connection so far. */
  received(): Buffer;
  /** Reset the captured buffer (call before the action you want to assert). */
  clear(): void;
  close(): Promise<void>;
}

/**
 * A network ESC/POS receipt printer (JetDirect :9100 style). Captures every
 * byte written so a test can assert the exact command stream (init 1B40,
 * drawer-kick 1B70…, cut 1D56, text, etc.). Binds an ephemeral port.
 */
export async function startEscposEmulator(): Promise<EscposEmulator> {
  let buf = Buffer.alloc(0);
  const server = net.createServer((socket) => {
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    port,
    received: () => buf,
    clear: () => {
      buf = Buffer.alloc(0);
    },
    close: () =>
      new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface ScaleEmulator {
  port: number;
  close: () => Promise<void>;
}

/**
 * A network NCI weighing scale. On the polled-mode request ("W\r") it replies
 * with an ASCII weight frame the backend's parseScaleWeight() understands.
 * The frame deliberately omits the "GS" gross marker so the parser's unit
 * regex locks onto the real unit token, not a stray letter.
 */
export async function startScaleEmulator(opts: {
  value: number;
  unit: "kg" | "lb";
  stable?: boolean;
}): Promise<ScaleEmulator> {
  const stable = opts.stable ?? true;
  const frame = `ST ${opts.value.toFixed(3)} ${opts.unit}${stable ? "" : " M"}\r\n`;
  const server = net.createServer((socket) => {
    let acc = "";
    socket.on("data", (d) => {
      acc += d.toString("ascii");
      if (acc.includes("\r")) {
        acc = "";
        socket.write(Buffer.from(frame, "ascii"));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** ESC/POS reference bytes (Epson command set) used by the assertions. */
export const ESCPOS = {
  INIT: Buffer.from([0x1b, 0x40]), // ESC @
  CUT_FULL: Buffer.from([0x1d, 0x56, 0x00]), // GS V 0
  DRAWER_KICK_PIN2: Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]), // ESC p 0
};
