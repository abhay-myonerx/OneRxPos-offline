import { randomUUID } from "node:crypto";
import type { LocalDatabase } from "@/local/database";
import { decryptEvent, encryptEvent } from "@/local/event-crypto";

export type EventOp = "insert" | "update" | "delete";
export interface EventInput {
  entity: string;
  entityId: string;
  op: EventOp;
  data: unknown;
  tenantId?: string;
  storeId?: string;
}

export function appendEvent(db: LocalDatabase, key: Buffer, e: EventInput): string {
  const id = randomUUID();
  const payload = encryptEvent(
    JSON.stringify({ entity: e.entity, entityId: e.entityId, op: e.op, data: e.data }),
    key,
  );
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO sync_events (id, entity, entityId, op, payload, tenantId, storeId, createdAt) VALUES (?,?,?,?,?,?,?,?)",
    ).run(id, e.entity, e.entityId, e.op, payload, e.tenantId ?? null, e.storeId ?? null, now);
    db.prepare("INSERT INTO sync_outbox (eventId, status, attempts) VALUES (?, 'pending', 0)").run(
      id,
    );
  });
  tx();
  return id;
}

export function readEvent(
  db: LocalDatabase,
  key: Buffer,
  id: string,
): { entity: string; entityId: string; op: EventOp; data: unknown } | null {
  const row = db.prepare("SELECT payload FROM sync_events WHERE id=?").get(id) as
    { payload: string } | undefined;
  if (!row) return null;
  return JSON.parse(decryptEvent(row.payload, key));
}
