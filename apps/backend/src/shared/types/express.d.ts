import { TenantPrismaClient } from "../../config/database";
import { Role } from "../../generated/prisma/enums";
import type { SyncContext } from "../../modules/sync/sync-token";

declare global {
  namespace Express {
    interface Request {
      // Store-node sync auth context — set by `syncAuth` middleware
      // (distinct from the user `req.user`/`req.tenantId` set by
      // `authenticate`).
      syncContext?: SyncContext;
      user?: {
        id: string;
        tenantId: string;
        storeId: string | null;
        storeIds: string[];
        role: Role;
        email: string;
        firstName: string;
        lastName: string;
        // Optional: present only when an auth path populates the linked
        // employee (e.g. ESS builds its actor via resolveSelf). The base
        // authenticate middleware does not set it — see OI-080.
        employeeId?: string | null;
      };
      tenantId?: string;
      db?: TenantPrismaClient; // tenant-scoped Prisma client
    }
  }
}

export {};
