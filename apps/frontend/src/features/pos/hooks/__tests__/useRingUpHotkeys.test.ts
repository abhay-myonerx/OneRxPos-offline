import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { useRingUpHotkeys } from "../useRingUpHotkeys";
import type { RingUpAction } from "../../keymap/ringup-keymap";

// ── Harness ──────────────────────────────────────────────────────────────
// Mounts the hook with the given handlers so we can dispatch real `keydown`
// events at `window` and assert which handler (if any) fired. Optionally
// renders a text `<input>` and focuses it, to exercise the typing-target
// skip logic.

function Harness({ handlers }: { handlers: Partial<Record<RingUpAction, () => void>> }) {
  useRingUpHotkeys(handlers);
  return createElement("input", { type: "text", "data-testid": "txt" });
}

// Dispatch on the currently-focused element (falling back to window) so the
// event bubbles up to the hook's window-level listener with `e.target` set
// to the actual focused element — matching real browser keydown behavior,
// where `target` is whatever has focus, not `window` itself.
function dispatchKey(key: string) {
  const target = (document.activeElement as HTMLElement | null) ?? window;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("useRingUpHotkeys", () => {
  it("F12 while nothing is focused calls the pay handler", () => {
    const pay = vi.fn();
    render(createElement(Harness, { handlers: { pay } }));

    dispatchKey("F12");

    expect(pay).toHaveBeenCalledTimes(1);
  });

  it("with a text input focused, '/' does NOT call focusSearch but F2 STILL calls priceOverride", () => {
    const focusSearch = vi.fn();
    const priceOverride = vi.fn();
    const { getByTestId } = render(
      createElement(Harness, { handlers: { focusSearch, priceOverride } }),
    );
    (getByTestId("txt") as HTMLInputElement).focus();
    expect(document.activeElement).toBe(getByTestId("txt"));

    dispatchKey("/");
    expect(focusSearch).not.toHaveBeenCalled();

    dispatchKey("F2");
    expect(priceOverride).toHaveBeenCalledTimes(1);
  });

  it("an unbound key calls nothing", () => {
    const pay = vi.fn();
    const focusSearch = vi.fn();
    render(createElement(Harness, { handlers: { pay, focusSearch } }));

    dispatchKey("q");

    expect(pay).not.toHaveBeenCalled();
    expect(focusSearch).not.toHaveBeenCalled();
  });
});
