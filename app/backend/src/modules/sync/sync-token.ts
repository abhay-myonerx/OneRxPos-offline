// Store-node bearer-JWT credential — mirrors `src/shared/utils/jwt.ts`'s
// access-token pattern, but scoped to the store-node <-> cloud sync channel
// (distinct secret + `typ` claim from the user-facing `authenticate` flow).

import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../../config";

export type SyncContext = {
  tenantId: string;
  storeId: string;
  deviceId: string;
};

export function mintSyncToken(p: SyncContext): string {
  return jwt.sign({ ...p, typ: "store-node" }, config.SYNC_TOKEN_SECRET, {
    expiresIn: "30d",
  } as SignOptions);
}
