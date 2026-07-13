// Physical peripheral I/O. Network printing renders a ReceiptJob to ESC/POS
// bytes (shared renderer — single source of truth) and writes them to the
// printer over TCP. Reachable by every client surface because the backend, not
// the browser, opens the socket.

import { renderReceipt, type ReceiptJob, type WeightReading } from "rx-pos-shared";
import { sendToPrinter, type PrinterTarget } from "./tcp-print";
import { readNetworkScale, type ScaleTarget } from "./scale-read";

export type { ScaleTarget } from "./scale-read";

/** Render a receipt job and send it to a network printer. Rejects on failure. */
export async function printReceiptToNetwork(
  job: ReceiptJob,
  target: PrinterTarget,
): Promise<void> {
  const bytes = renderReceipt(job);
  await sendToPrinter(bytes, target);
}

/** Pop a cash drawer chained to a network printer via the ESC/POS kick command. */
export async function openCashDrawerToNetwork(target: PrinterTarget): Promise<void> {
  await printReceiptToNetwork({ lines: [], openDrawer: true }, target);
}

/** Read a live weight from a network-attached scale. Rejects on failure. */
export async function readWeightFromNetwork(target: ScaleTarget): Promise<WeightReading> {
  return readNetworkScale(target);
}
