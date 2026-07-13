import { readFileSync, writeFileSync } from "node:fs";

// Load recent crash timestamps from a JSON array file; [] on any error (missing/corrupt).
export function loadCrashHistory(filePath: string): number[] {
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    return Array.isArray(data) ? data.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

// Record a crash at `now`, prune to the window, persist, and return whether to relaunch
// (relaunch unless >= maxRestarts crashes remain within windowMs). Persisting across
// process restarts is what makes the throttle real — app.relaunch() spawns a new process.
export function recordCrashAndShouldRelaunch(
  filePath: string,
  now: number,
  opts: { maxRestarts: number; windowMs: number },
): boolean {
  const recent = loadCrashHistory(filePath).filter(
    (t) => now - t <= opts.windowMs,
  );
  recent.push(now);
  try {
    writeFileSync(filePath, JSON.stringify(recent));
  } catch {
    // best-effort; if we can't persist, fall back to allowing the relaunch
  }
  return recent.length < opts.maxRestarts;
}
