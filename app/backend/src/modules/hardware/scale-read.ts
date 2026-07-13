import net from "node:net";
import { parseScaleWeight, type WeightReading } from "rx-pos-shared";

export interface ScaleTarget {
  ip: string;
  port: number;
  timeoutMs?: number;
}

// NCI polled-mode weight request: "W" + CR.
const POLL = Buffer.from("W\r", "ascii");

/**
 * Connect to a network scale, poll for weight, and resolve the first frame that
 * parses to a WeightReading. Rejects on connection error or if no parseable
 * frame arrives before the timeout — fail-closed; the caller surfaces it.
 */
export function readNetworkScale(target: ScaleTarget): Promise<WeightReading> {
  const timeoutMs = target.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    let buf = "";
    const done = (err?: Error, reading?: WeightReading) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(reading as WeightReading);
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () =>
      done(new Error(`Scale ${target.ip}:${target.port} timed out after ${timeoutMs}ms`)),
    );
    socket.once("error", (err) => done(err));
    socket.on("data", (d: Buffer) => {
      buf += d.toString("ascii");
      const reading = parseScaleWeight(buf);
      if (reading) done(undefined, reading);
    });
    socket.connect(target.port, target.ip, () => {
      socket.write(POLL);
    });
  });
}
