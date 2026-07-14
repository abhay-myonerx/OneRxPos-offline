import type { LocalDatabase } from "@/local/database";
export type EventOp = "insert" | "update" | "delete";
export interface EventInput {
    entity: string;
    entityId: string;
    op: EventOp;
    data: unknown;
    tenantId?: string;
    storeId?: string;
}
export declare function appendEvent(db: LocalDatabase, key: Buffer, e: EventInput): string;
export declare function readEvent(db: LocalDatabase, key: Buffer, id: string): {
    entity: string;
    entityId: string;
    op: EventOp;
    data: unknown;
} | null;
//# sourceMappingURL=event-log.d.ts.map