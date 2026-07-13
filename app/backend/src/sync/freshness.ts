const HOUR_MS = 60 * 60 * 1000;

/**
 * Sync data-freshness indicator (spec §6.3): green < 24h, yellow 24–72h, red > 72h or never.
 */
export function freshnessFromLastSync(
  lastSyncAt: number | null,
  now: number,
): "green" | "yellow" | "red" {
  if (lastSyncAt === null) return "red";
  const ageH = (now - lastSyncAt) / HOUR_MS;
  if (ageH < 24) return "green";
  if (ageH <= 72) return "yellow";
  return "red";
}
