import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "@/config";
import { verifyWithRotation, rotationKeys } from "@/shared/utils/token-rotation";

export interface OverrideClaims { action: string; authorizerUserId: string; contextHash: string; jti: string; }

export function mintOverrideGrant(c: OverrideClaims): string {
  return jwt.sign({ ...c, typ: "pos-override" }, config.POS_OVERRIDE_SECRET, { expiresIn: "2m" } as SignOptions);
}

export function verifyOverrideGrant(token: string): OverrideClaims {
  const p = verifyWithRotation<OverrideClaims & { typ?: string }>(
    token,
    rotationKeys(config.POS_OVERRIDE_SECRET, config.POS_OVERRIDE_SECRET_PREVIOUS),
  );
  if (p.typ !== "pos-override") throw new Error("Invalid override grant type");
  return { action: p.action, authorizerUserId: p.authorizerUserId, contextHash: p.contextHash, jti: p.jti };
}
