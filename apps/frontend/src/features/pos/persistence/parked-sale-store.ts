import type { ParkedSaleRecord, ParkedSnapshot } from "../types/parked-sale.types";

/**
 * The active-cart crash-recovery mirror (Phase 1.3b, decision B4). A single
 * snapshot of the in-progress (un-parked) cart, refreshed on every cart change
 * and cleared on checkout / park / clear, so a refresh or crash can offer to
 * recover the sale in progress.
 */
export interface ActiveCartMirror {
  snapshot: ParkedSnapshot;
  /** ISO timestamp of the last mirror write. */
  updatedAt: string;
}

/**
 * Local persistence for parked sales + the active-cart recovery mirror. The
 * device's IndexedDB is authoritative for park/resume (Approach A); the backend
 * is a best-effort mirror layered on top by `useParkedSales`.
 *
 * The interface is storage-agnostic so the Electron shell can later back it
 * with SQLite (Phase 0.4 dual-shell) without touching callers.
 */
export interface ParkedSaleStore {
  put(record: ParkedSaleRecord): Promise<void>;
  list(): Promise<ParkedSaleRecord[]>;
  get(id: string): Promise<ParkedSaleRecord | undefined>;
  remove(id: string): Promise<void>;
  saveActive(mirror: ActiveCartMirror): Promise<void>;
  loadActive(): Promise<ActiveCartMirror | null>;
  clearActive(): Promise<void>;
}

const DB_NAME = "rxpos-pos";
const DB_VERSION = 1;
const PARKED_STORE = "parkedSales";
const ACTIVE_STORE = "activeCart";
const ACTIVE_KEY = "current";

/** Minimal promise wrapper over an IDBRequest. */
function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

class IndexedDbParkedSaleStore implements ParkedSaleStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PARKED_STORE)) {
          db.createObjectStore(PARKED_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(ACTIVE_STORE)) {
          db.createObjectStore(ACTIVE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx<T>(
    store: string,
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.openDb();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const request = run(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  put(record: ParkedSaleRecord): Promise<void> {
    return this.tx(PARKED_STORE, "readwrite", (s) => s.put(record)).then(() => undefined);
  }

  async list(): Promise<ParkedSaleRecord[]> {
    const all = await this.tx<ParkedSaleRecord[]>(PARKED_STORE, "readonly", (s) => s.getAll());
    return all ?? [];
  }

  get(id: string): Promise<ParkedSaleRecord | undefined> {
    return this.tx(PARKED_STORE, "readonly", (s) => s.get(id));
  }

  remove(id: string): Promise<void> {
    return this.tx(PARKED_STORE, "readwrite", (s) => s.delete(id)).then(() => undefined);
  }

  saveActive(mirror: ActiveCartMirror): Promise<void> {
    return this.tx(ACTIVE_STORE, "readwrite", (s) => s.put(mirror, ACTIVE_KEY)).then(() => undefined);
  }

  async loadActive(): Promise<ActiveCartMirror | null> {
    const m = await this.tx<ActiveCartMirror | undefined>(ACTIVE_STORE, "readonly", (s) =>
      s.get(ACTIVE_KEY),
    );
    return m ?? null;
  }

  clearActive(): Promise<void> {
    return this.tx(ACTIVE_STORE, "readwrite", (s) => s.delete(ACTIVE_KEY)).then(() => undefined);
  }
}

/** In-memory fallback for SSR / private-mode / test environments with no IndexedDB. */
class InMemoryParkedSaleStore implements ParkedSaleStore {
  private records = new Map<string, ParkedSaleRecord>();
  private active: ActiveCartMirror | null = null;

  async put(record: ParkedSaleRecord) {
    this.records.set(record.id, record);
  }
  async list() {
    return [...this.records.values()];
  }
  async get(id: string) {
    return this.records.get(id);
  }
  async remove(id: string) {
    this.records.delete(id);
  }
  async saveActive(mirror: ActiveCartMirror) {
    this.active = mirror;
  }
  async loadActive() {
    return this.active;
  }
  async clearActive() {
    this.active = null;
  }
}

let singleton: ParkedSaleStore | null = null;

/**
 * The process-wide parked-sale store. Uses IndexedDB when available (browser /
 * fake-indexeddb in tests), otherwise a no-persistence in-memory store so
 * park/resume degrades gracefully rather than throwing (e.g. SSR, private mode).
 */
export function getParkedSaleStore(): ParkedSaleStore {
  if (singleton) return singleton;
  singleton =
    typeof indexedDB !== "undefined"
      ? new IndexedDbParkedSaleStore()
      : new InMemoryParkedSaleStore();
  return singleton;
}

/** Test seam: force a specific store implementation (or reset to auto-detect). */
export function __setParkedSaleStore(store: ParkedSaleStore | null): void {
  singleton = store;
}

export { IndexedDbParkedSaleStore, InMemoryParkedSaleStore };
