import { useEffect } from "react";
import { keyToAction, RingUpAction } from "../keymap/ringup-keymap";

const FN_KEYS = new Set(["F1", "F2", "F3", "F4", "F7", "F8", "F9", "F12"]);

function isTypingTarget(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  if (!n) return false;
  const tag = n.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || n.isContentEditable === true;
}

/**
 * Global keyboard-first hotkey dispatcher for the ring-up screen (Phase
 * 1.3a, Task 12). Maps `RINGUP_KEYMAP` (Task 4) keys to caller-supplied
 * handlers via a single `window` `keydown` listener.
 *
 * Text-input-aware: while a text `<input>`/`<textarea>`/contentEditable
 * element is focused (e.g. the product search box, a discount field), plain
 * character keys like `/` or `+` are left alone so normal typing (and the
 * barcode scanner's keystroke emulation) is never hijacked. Fn keys (F1-F4,
 * F9, F12) have no typing meaning, so they still fire their action even
 * while a text field is focused — and get `preventDefault()`ed since some of
 * those (F1 help, F9 clear) have browser-default behavior worth suppressing.
 */
export function useRingUpHotkeys(
  handlers: Partial<Record<RingUpAction, () => void>>,
  opts: { enabled?: boolean } = {},
): void {
  const enabled = opts.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const action = keyToAction(e.key);
      if (!action) return;
      if (isTypingTarget(e.target) && !FN_KEYS.has(e.key)) return;
      const fn = handlers[action];
      if (fn) {
        if (FN_KEYS.has(e.key)) e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled]);
}
