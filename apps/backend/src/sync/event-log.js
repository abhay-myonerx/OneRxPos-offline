"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendEvent = appendEvent;
exports.readEvent = readEvent;
const node_crypto_1 = require("node:crypto");
const event_crypto_1 = require("@/local/event-crypto");
function appendEvent(db, key, e) {
    const id = (0, node_crypto_1.randomUUID)();
    const payload = (0, event_crypto_1.encryptEvent)(JSON.stringify({ entity: e.entity, entityId: e.entityId, op: e.op, data: e.data }), key);
    const now = new Date().toISOString();
    const tx = db.transaction(() => {
        db.prepare("INSERT INTO sync_events (id, entity, entityId, op, payload, tenantId, storeId, createdAt) VALUES (?,?,?,?,?,?,?,?)").run(id, e.entity, e.entityId, e.op, payload, e.tenantId ?? null, e.storeId ?? null, now);
        db.prepare("INSERT INTO sync_outbox (eventId, status, attempts) VALUES (?, 'pending', 0)").run(id);
    });
    tx();
    return id;
}
function readEvent(db, key, id) {
    const row = db.prepare("SELECT payload FROM sync_events WHERE id=?").get(id);
    if (!row)
        return null;
    return JSON.parse((0, event_crypto_1.decryptEvent)(row.payload, key));
}
//# sourceMappingURL=event-log.js.map