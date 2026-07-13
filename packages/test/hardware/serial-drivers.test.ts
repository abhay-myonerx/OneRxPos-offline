import { describe, it, expect } from "vitest";
import type { ByteChannel } from "../../src/hardware/byte-channel";
import {
  printOverChannel,
  openDrawerOverChannel,
  readWeightOverChannel,
  tareOverChannel,
  zeroOverChannel,
} from "../../src/hardware/serial-drivers";

class MockChannel implements ByteChannel {
  written: number[][] = [];
  reply: string | null = null; // if set, emitted (as ASCII) after each write
  private listeners: ((c: Uint8Array) => void)[] = [];
  async write(bytes: Uint8Array): Promise<void> {
    this.written.push(Array.from(bytes));
    if (this.reply !== null) {
      const frame = Uint8Array.from([...this.reply].map((c) => c.charCodeAt(0)));
      setTimeout(() => this.listeners.forEach((l) => l(frame)), 0);
    }
  }
  onData(cb: (c: Uint8Array) => void): () => void {
    this.listeners.push(cb);
    return () => {};
  }
  async close(): Promise<void> {}
}

describe("serial drivers", () => {
  it("prints ESC/POS bytes over the channel by default", async () => {
    const ch = new MockChannel();
    await printOverChannel(ch, { lines: [{ text: "Hi" }], cut: true });
    expect(ch.written[0].slice(0, 2)).toEqual([0x1b, 0x40]); // ESC @
    expect(ch.written[0].slice(-3)).toEqual([0x1d, 0x56, 0x00]); // GS V 0 cut
  });

  it("prints Star bytes when commandSet is star", async () => {
    const ch = new MockChannel();
    await printOverChannel(ch, { lines: [], cut: true }, { commandSet: "star" });
    expect(ch.written[0].slice(-3)).toEqual([0x1b, 0x64, 0x02]); // ESC d 2 (Star cut)
  });

  it("opens the drawer via the printer kick", async () => {
    const ch = new MockChannel();
    await openDrawerOverChannel(ch);
    expect(ch.written[0].slice(-5)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it("polls the scale and resolves the parsed weight", async () => {
    const ch = new MockChannel();
    ch.reply = "1.245kgS\r";
    const reading = await readWeightOverChannel(ch);
    expect(reading).toEqual({ value: 1.245, unit: "kg", stable: true });
    expect(ch.written[0]).toEqual([0x57, 0x0d]); // "W\r" poll
  });

  it("rejects when the scale never replies (timeout)", async () => {
    const ch = new MockChannel(); // no reply
    await expect(readWeightOverChannel(ch, { timeoutMs: 50 })).rejects.toThrow();
  });

  it("tares the scale (T\\r) over the channel", async () => {
    const ch = new MockChannel();
    await tareOverChannel(ch);
    expect(ch.written[0]).toEqual([0x54, 0x0d]); // "T\r"
  });

  it("zeroes the scale (Z\\r) over the channel", async () => {
    const ch = new MockChannel();
    await zeroOverChannel(ch);
    expect(ch.written[0]).toEqual([0x5a, 0x0d]); // "Z\r"
  });
});
