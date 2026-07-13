// Public LocalStore surface consumed by Phase 1 (offline sales). Re-exports
// only the concrete, stable API — internal-only helpers (e.g. event-crypto)
// are intentionally excluded.
export { createLocalStore } from "./local-store";
export type {
  LocalStore,
  ProductRow,
  CustomerRow,
  SaleRow,
  SaleItemRow,
  PaymentRow,
} from "./local-store.types";

export { getLocalDb, openLocalDb, closeLocalDb } from "./database";
export type { LocalDatabase } from "./database";

export { initSchema } from "./schema";

export { deriveLocalDbKey, keyToHex } from "./key-derivation";
