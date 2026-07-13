// Registry dispatching each entity to its conflict-resolution strategy
// (spec §6.3). Pure — takes already-loaded local/remote record snapshots
// and returns the resolved record; no DB access happens here.
import { logger } from "@/shared/utils/logger";
import { appendOnly, fieldMergeLatestTimestamp, serverWins, sumOfDecrements } from "./strategies";

type Strategy = (local: unknown, remote: unknown) => unknown;

const registry: Record<string, Strategy> = {
  sales: appendOnly,
  store_stock: (local, remote) =>
    sumOfDecrements(local as { quantity: number }, remote as { quantity: number }),
  products: serverWins,
  users: serverWins,
  customers: (local, remote) =>
    fieldMergeLatestTimestamp(local as Record<string, unknown>, remote as Record<string, unknown>),
};

/**
 * Resolve a conflict for the given entity type. Unknown entities fall back
 * to serverWins (the safe default) and log a warning so the gap gets
 * noticed instead of silently resolving the wrong way.
 */
export function resolveConflict(entity: string, local: unknown, remote: unknown): unknown {
  const strategy = registry[entity];
  if (!strategy) {
    logger.warn({ entity }, "resolveConflict: no strategy registered, falling back to serverWins");
    return serverWins(local, remote);
  }
  return strategy(local, remote);
}
