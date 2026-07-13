import type { ByteChannel } from "./byte-channel";
import type { ReceiptJob, WeightReading } from "./hal.types";
import { printOverChannel, openDrawerOverChannel, readWeightOverChannel } from "./serial-drivers";

export type HostAction = "print" | "drawer" | "weigh";

export interface HostChannels {
  /** Printer + drawer share the printer channel (the drawer kicks through the printer). */
  printer?: ByteChannel;
  scale?: ByteChannel;
}

export interface HostResult {
  ok: boolean;
  reason?: string;
  weight?: WeightReading;
}

/**
 * Execute a relayed hardware action on the station host's native channels —
 * answers the 2.9.4 relay's `hardware:execute`. Fail-closed: a missing channel
 * or a driver error returns { ok:false, reason }; never throws to the relay.
 */
export async function executeHostAction(
  action: HostAction,
  payload: unknown,
  channels: HostChannels,
): Promise<HostResult> {
  try {
    if (action === "print") {
      if (!channels.printer) return { ok: false, reason: "no-printer" };
      await printOverChannel(channels.printer, payload as ReceiptJob);
      return { ok: true };
    }
    if (action === "drawer") {
      if (!channels.printer) return { ok: false, reason: "no-printer" };
      await openDrawerOverChannel(channels.printer);
      return { ok: true };
    }
    if (action === "weigh") {
      if (!channels.scale) return { ok: false, reason: "no-scale" };
      const weight = await readWeightOverChannel(channels.scale);
      return { ok: true, weight };
    }
    return { ok: false, reason: "unknown-action" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "host-error" };
  }
}
