import { describe, it, expect } from "vitest";
import type { ByteChannel } from "../../src/hardware/byte-channel";
import { executeHostAction } from "../../src/hardware/host-executor";

class MockChannel implements ByteChannel {
  written: number[][] = [];
  reply: string | null = null;
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

describe("executeHostAction", () => {
  it("print → writes ESC/POS to the printer channel", async () => {
    const printer = new MockChannel();
    const res = await executeHostAction("print", { lines: [{ text: "Hi" }] }, { printer });
    expect(res.ok).toBe(true);
    expect(printer.written[0].slice(0, 2)).toEqual([0x1b, 0x40]);
  });

  it("drawer → kicks via the printer channel", async () => {
    const printer = new MockChannel();
    const res = await executeHostAction("drawer", {}, { printer });
    expect(res.ok).toBe(true);
    expect(printer.written[0].slice(-5)).toEqual([0x1b, 0x70, 0x00, 0x19, 0xfa]);
  });

  it("weigh → returns the parsed weight from the scale channel", async () => {
    const scale = new MockChannel();
    scale.reply = "2.500kgS\r";
    const res = await executeHostAction("weigh", {}, { scale });
    expect(res.ok).toBe(true);
    expect(res.weight).toEqual({ value: 2.5, unit: "kg", stable: true });
  });

  it("fail-closed when the required channel is missing", async () => {
    expect(await executeHostAction("print", {}, {})).toEqual({ ok: false, reason: "no-printer" });
    expect(await executeHostAction("weigh", {}, {})).toEqual({ ok: false, reason: "no-scale" });
  });

  it("unknown action → not ok", async () => {
    const res = await executeHostAction("nope" as never, {}, {});
    expect(res.ok).toBe(false);
  });
});
