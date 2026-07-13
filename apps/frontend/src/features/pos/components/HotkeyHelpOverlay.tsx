"use client";

import { Modal } from "@/components/ui/modal";
import { RINGUP_KEYMAP, RingUpAction } from "../keymap/ringup-keymap";

export interface HotkeyHelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

// Human-readable labels for each action, in display order (roughly the order
// a cashier hits them during a sale: find the item, fix a line, then pay).
const ACTION_LABELS: Record<RingUpAction, string> = {
  focusSearch: "Focus product search",
  manualBarcode: "Enter barcode manually",
  manualItem: "Add manual/misc item",
  priceOverride: "Price override",
  voidLine: "Void selected line",
  qtyIncrement: "Increase line quantity",
  qtyDecrement: "Decrease line quantity",
  nextLine: "Select next line",
  prevLine: "Select previous line",
  clearTransaction: "Clear transaction",
  pay: "Charge / pay",
  parkSale: "Park (suspend) sale",
  recallSale: "Recall parked sale",
  help: "Show this help",
};

// Display order: not the Record's declaration order (which groups by key
// type), but the order a cashier actually reaches for these during a sale.
const DISPLAY_ORDER: RingUpAction[] = [
  "focusSearch",
  "manualBarcode",
  "manualItem",
  "nextLine",
  "prevLine",
  "qtyIncrement",
  "qtyDecrement",
  "priceOverride",
  "voidLine",
  "clearTransaction",
  "parkSale",
  "recallSale",
  "pay",
  "help",
];

/**
 * Keyboard-shortcut reference (Phase 1.3a, Task 12) — a read-only table of
 * every `RINGUP_KEYMAP` (Task 4) action and its bound key, toggled by the
 * `help` hotkey (F1) via `useRingUpHotkeys`. Mirrors `OverrideModal`'s use of
 * the shared `Modal` primitive for a simple, presentational overlay.
 */
export function HotkeyHelpOverlay({ open, onClose }: HotkeyHelpOverlayProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Ring-up hotkeys — work everywhere except while typing (Fn keys always work)."
      size="sm"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            <th className="pb-2 font-medium">Action</th>
            <th className="pb-2 font-medium text-right">Key</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {DISPLAY_ORDER.map((action) => (
            <tr key={action}>
              <td className="py-2 text-slate-700 dark:text-slate-200">{ACTION_LABELS[action]}</td>
              <td className="py-2 text-right">
                <kbd className="inline-block rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                  {RINGUP_KEYMAP[action]}
                </kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
