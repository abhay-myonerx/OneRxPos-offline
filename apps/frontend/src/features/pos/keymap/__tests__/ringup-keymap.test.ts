import { describe, it, expect } from "vitest";
import { RINGUP_KEYMAP, keyToAction, RingUpAction } from "../ringup-keymap";

describe("ring-up keymap", () => {
  it("maps every action to a key with no duplicate keys", () => {
    const keys = Object.values(RINGUP_KEYMAP);
    expect(new Set(keys).size).toBe(keys.length); // no collisions
  });
  it("covers the required till actions", () => {
    const required: RingUpAction[] = ["focusSearch","manualBarcode","manualItem","priceOverride","voidLine","clearTransaction","pay","qtyIncrement","qtyDecrement","nextLine","prevLine","help","parkSale","recallSale"];
    for (const a of required) expect(RINGUP_KEYMAP[a]).toBeTruthy();
  });
  it("reverse lookup resolves a bound key to its action", () => {
    expect(keyToAction("F12")).toBe("pay");
    expect(keyToAction("F2")).toBe("priceOverride");
    expect(keyToAction("z")).toBeNull();
  });
});
