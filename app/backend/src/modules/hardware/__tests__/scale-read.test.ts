import { describe, it, expect } from "vitest";
import { readNetworkScale } from "../scale-read";
import { makeScaleEmulator } from "./scale-emulator";

describe("readNetworkScale", () => {
  it("polls the scale and returns the parsed weight", async () => {
    const emu = await makeScaleEmulator("1.245kgS\r");
    const reading = await readNetworkScale({ ip: "127.0.0.1", port: emu.port });
    expect(reading).toEqual({ value: 1.245, unit: "kg", stable: true });
    emu.close();
  });

  it("rejects when the scale is unreachable", async () => {
    await expect(
      readNetworkScale({ ip: "127.0.0.1", port: 1, timeoutMs: 800 }),
    ).rejects.toThrow();
  });

  it("rejects (times out) when the frame never parses", async () => {
    const emu = await makeScaleEmulator("garbled-no-weight\r");
    await expect(
      readNetworkScale({ ip: "127.0.0.1", port: emu.port, timeoutMs: 800 }),
    ).rejects.toThrow();
    emu.close();
  });
});
