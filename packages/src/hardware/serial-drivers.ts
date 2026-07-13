import type { ByteChannel } from "./byte-channel";
import type { ReceiptJob, WeightReading } from "./hal.types";
import { renderReceipt } from "./escpos-render";
import { renderStarReceipt } from "./star-render";
import { parseScaleWeight } from "./scale-nci";

function bytesToAscii(chunk: Uint8Array): string {
  let s = "";
  for (const b of chunk) s += String.fromCharCode(b);
  return s;
}

/** Print a receipt over a byte channel. Command set + codepage from the profile. */
export async function printOverChannel(
  channel: ByteChannel,
  job: ReceiptJob,
  opts: { commandSet?: "escpos" | "star"; codepage?: string } = {},
): Promise<void> {
  const bytes =
    opts.commandSet === "star"
      ? renderStarReceipt(job)
      : renderReceipt(job, { codepage: opts.codepage });
  await channel.write(bytes);
}

/** Pop a cash drawer over a channel via the printer kick (empty job). */
export async function openDrawerOverChannel(
  channel: ByteChannel,
  opts: { commandSet?: "escpos" | "star" } = {},
): Promise<void> {
  await printOverChannel(channel, { lines: [], openDrawer: true }, opts);
}

/** Poll a scale over a channel; resolve the first parseable weight, or reject on timeout. */
export function readWeightOverChannel(
  channel: ByteChannel,
  opts: { pollCmd?: number[]; timeoutMs?: number } = {},
): Promise<WeightReading> {
  const pollCmd = opts.pollCmd ?? [0x57, 0x0d]; // "W\r"
  const timeoutMs = opts.timeoutMs ?? 5000;
  return new Promise<WeightReading>((resolve, reject) => {
    let buf = "";
    let settled = false;
    const done = (err?: Error, reading?: WeightReading): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      if (err) reject(err);
      else resolve(reading as WeightReading);
    };
    const timer = setTimeout(() => done(new Error("scale read timed out")), timeoutMs);
    const unsub = channel.onData((chunk) => {
      buf += bytesToAscii(chunk);
      const reading = parseScaleWeight(buf);
      if (reading) done(undefined, reading);
    });
    channel
      .write(Uint8Array.from(pollCmd))
      .catch((e) => done(e instanceof Error ? e : new Error(String(e))));
  });
}

/** NCI scale control command bytes. */
export const SCALE_CMD = {
  poll: [0x57, 0x0d], // "W\r"
  tare: [0x54, 0x0d], // "T\r"
  zero: [0x5a, 0x0d], // "Z\r"
} as const;

/** Tare the scale (subtract current load) over a channel. */
export async function tareOverChannel(
  channel: ByteChannel,
  cmd: number[] = [...SCALE_CMD.tare],
): Promise<void> {
  await channel.write(Uint8Array.from(cmd));
}

/** Zero the scale over a channel. */
export async function zeroOverChannel(
  channel: ByteChannel,
  cmd: number[] = [...SCALE_CMD.zero],
): Promise<void> {
  await channel.write(Uint8Array.from(cmd));
}
