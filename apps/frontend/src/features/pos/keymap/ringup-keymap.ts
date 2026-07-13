export type RingUpAction =
  | "focusSearch" | "manualBarcode" | "manualItem" | "priceOverride"
  | "voidLine" | "clearTransaction" | "pay"
  | "qtyIncrement" | "qtyDecrement" | "nextLine" | "prevLine" | "help"
  | "parkSale" | "recallSale";

export const RINGUP_KEYMAP: Record<RingUpAction, string> = {
  focusSearch: "/",
  manualBarcode: "F3",
  manualItem: "F4",
  priceOverride: "F2",
  voidLine: "Delete",
  clearTransaction: "F9",
  pay: "F12",
  qtyIncrement: "+",
  qtyDecrement: "-",
  nextLine: "ArrowDown",
  prevLine: "ArrowUp",
  help: "F1",
  parkSale: "F7",
  recallSale: "F8",
};

const REVERSE: Record<string, RingUpAction> = Object.fromEntries(
  Object.entries(RINGUP_KEYMAP).map(([a, k]) => [k, a as RingUpAction]),
);

export function keyToAction(key: string): RingUpAction | null {
  return REVERSE[key] ?? null;
}
