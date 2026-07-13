// Zod schemas for the in-app notification module.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";
import { Role, NotificationType } from "../../generated/prisma/enums";

const notificationTypeEnum = z.enum(Object.values(NotificationType) as [string, ...string[]]);

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid notification id"),
});

export const listQuerySchema = createListQuerySchema({
  sortable: ["createdAt"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    isRead: z.coerce.boolean().optional(),
    type: notificationTypeEnum.optional(),
  }),
});
export type ListNotificationInput = z.infer<typeof listQuerySchema>;

// Manual broadcast — admins target an audience by role(s), a single store, or
// the whole tenant. Exactly one targeting mode must be supplied.
export const broadcastSchema = z
  .object({
    type: notificationTypeEnum.default(NotificationType.SYSTEM),
    title: z.string().trim().min(1, "Title is required").max(255),
    body: z.string().trim().min(1, "Body is required").max(4000),
    link: z.string().trim().max(500).optional().nullable(),
    data: z.record(z.string(), z.unknown()).optional(),
    // Targeting — exactly one of these.
    roles: z
      .array(z.enum(Object.values(Role) as [string, ...string[]]))
      .min(1)
      .optional(),
    storeId: z.string().uuid().optional(),
    tenantWide: z.literal(true).optional(),
  })
  .refine(
    (v) =>
      [v.roles !== undefined, v.storeId !== undefined, v.tenantWide === true].filter(Boolean)
        .length === 1,
    {
      message: "Specify exactly one target: `roles`, `storeId`, or `tenantWide: true`",
    },
  );
export type BroadcastInput = z.infer<typeof broadcastSchema>;
