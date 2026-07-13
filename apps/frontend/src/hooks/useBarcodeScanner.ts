// Detects USB / Bluetooth barcode scanner input.
//
// How it works:
// Hardware barcode scanners emulate a keyboard — they fire rapid `keydown`
// events (< 50 ms apart) and finish with an Enter key.  Normal human typing
// is much slower, so we can reliably distinguish the two by measuring the
// inter-keystroke interval.
//
// The hook buffers incoming characters. When Enter arrives *and* the average
// interval between keystrokes is below `maxKeystrokeMs`, the buffer is
// flushed to the `onScan` callback. Otherwise the buffer is silently
// discarded so regular typing is never intercepted.

import { useEffect, useRef, useCallback } from "react";

interface UseBarcodeScanner {
  /** Called with the scanned barcode string. */
  onScan: (barcode: string) => void;
  /** Whether the scanner listener is active (default: true). */
  enabled?: boolean;
  /** Max ms between keystrokes to qualify as scanner input (default: 50). */
  maxKeystrokeMs?: number;
  /** Minimum barcode length to accept (default: 3). */
  minLength?: number;
}

export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxKeystrokeMs = 50,
  minLength = 3,
}: UseBarcodeScanner) {
  const bufferRef = useRef<string>("");
  const timestampsRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable callback ref so we don't re-attach listeners on every render
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const resetBuffer = useCallback(() => {
    bufferRef.current = "";
    timestampsRef.current = [];
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const isTypingField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Special case: if the active element is the barcode-aware search input
      // (data-barcode-aware), we still want to capture scanner input
      const isBarcodeAware = target.getAttribute("data-barcode-aware") === "true";

      if (isTypingField && !isBarcodeAware) return;

      const now = Date.now();

      // Enter key: attempt to flush the buffer
      if (e.key === "Enter") {
        const buffer = bufferRef.current;
        const timestamps = timestampsRef.current;

        if (buffer.length >= minLength && timestamps.length >= minLength) {
          // Calculate average interval between keystrokes
          let totalInterval = 0;
          for (let i = 1; i < timestamps.length; i++) {
            totalInterval += timestamps[i] - timestamps[i - 1];
          }
          const avgInterval = totalInterval / (timestamps.length - 1);

          if (avgInterval <= maxKeystrokeMs) {
            e.preventDefault();
            e.stopPropagation();
            onScanRef.current(buffer);
          }
        }

        resetBuffer();
        return;
      }

      // Only buffer printable single characters
      if (e.key.length !== 1) return;

      // If buffer is empty or too much time has passed since last key, start fresh
      if (
        timestampsRef.current.length > 0 &&
        now - timestampsRef.current[timestampsRef.current.length - 1] > maxKeystrokeMs * 3
      ) {
        resetBuffer();
      }

      bufferRef.current += e.key;
      timestampsRef.current.push(now);

      // Safety timeout: clear stale buffer after 500ms of inactivity
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(resetBuffer, 500);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      resetBuffer();
    };
  }, [enabled, maxKeystrokeMs, minLength, resetBuffer]);

  return { resetBuffer };
}
