import { describe, it, expect } from "vitest";
import { printReceiptToNetwork, openCashDrawerToNetwork } from "../hardware.service";
import { makeEmulator } from "./printer-emulator";

describe("printReceiptToNetwork", () => {
  it("renders the job and sends ESC/POS bytes (init + cut) to the printer", async () => {
    const emu = await makeEmulator();
    await printReceiptToNetwork(
      { lines: [{ text: "Hi" }], cut: true },
      { ip: "127.0.0.1", port: emu.port },
    );
    const got = Array.from(await emu.received);
    expect(got.slice(0, 2)).toEqual([0x1b, 0x40]); // ESC @ init
    expect(got.slice(-3)).toEqual([0x1d, 0x56, 0x00]); // GS V 0 cut
    emu.close();
  });
});

describe("openCashDrawerToNetwork", () => {
  it("sends the ESC/POS drawer-kick to the printer", async () => {
    const emu = await makeEmulator();
    await openCashDrawerToNetwork({ ip: "127.0.0.1", port: emu.port });
    const got = Array.from(await emu.received);
    // ESC p 0 25 250 — the kick is the trailing 5 bytes of an empty job
    expect(got.slice(-5)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
    emu.close();
  });
});
