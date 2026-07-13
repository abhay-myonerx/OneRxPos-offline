import { describe, it, expect } from "vitest";
import { sendToPrinter } from "../tcp-print";
import { makeEmulator } from "./printer-emulator";

describe("sendToPrinter", () => {
  it("delivers the exact bytes to a listening printer", async () => {
    const emu = await makeEmulator();
    await sendToPrinter(Uint8Array.from([0x1b, 0x40, 0x41]), {
      ip: "127.0.0.1",
      port: emu.port,
    });
    expect(Array.from(await emu.received)).toEqual([0x1b, 0x40, 0x41]);
    emu.close();
  });

  it("rejects when the printer is unreachable", async () => {
    await expect(
      sendToPrinter(Uint8Array.from([0x41]), {
        ip: "127.0.0.1",
        port: 1,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow();
  });
});
