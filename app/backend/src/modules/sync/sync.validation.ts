import { z } from "zod";

// ── Event envelope — a single local mutation queued for cloud sync ──────────

export type EventEnvelope = {
  id: string;
  entity: string;
  entityId: string;
  op: "insert" | "update" | "delete";
  data: unknown;
};

// ── POST /api/v2/sync/push ───────────────────────────────────────────────────

export const pushBodySchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      entity: z.string(),
      entityId: z.string(),
      op: z.enum(["insert", "update", "delete"]),
      data: z.unknown(),
    }),
  ),
});

export type PushBody = z.infer<typeof pushBodySchema>;
