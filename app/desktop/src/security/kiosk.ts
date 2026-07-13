export function resolveKiosk(env: Record<string, string | undefined>): {
  kiosk: boolean;
  fullscreen: boolean;
} {
  const kiosk = env.RXPOS_KIOSK === "1";
  return { kiosk, fullscreen: kiosk };
}

// Crash-loop guard: relaunch unless there were >= maxRestarts crashes within windowMs.
export function shouldRelaunch(
  crashTimes: number[],
  now: number,
  opts: { maxRestarts: number; windowMs: number },
): boolean {
  const recent = crashTimes.filter((t) => now - t <= opts.windowMs);
  return recent.length < opts.maxRestarts;
}
