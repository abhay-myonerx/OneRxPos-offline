import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../../config";
import { verifyWithRotation, rotationKeys } from "@/shared/utils/token-rotation";

export type LeaseClaims = {
  licenseId: string;
  tenantId: string;
  deviceFingerprint: string;
  plan: string;
  seat: number;
};

export function mintLicenseLease(claims: LeaseClaims): string {
  return jwt.sign({ ...claims, typ: "license-lease" }, config.LICENSE_TOKEN_SECRET, {
    expiresIn: "30d",
  } as SignOptions);
}

export function verifyLicenseLease(token: string): LeaseClaims {
  const p = verifyWithRotation<LeaseClaims & { typ?: string }>(
    token,
    rotationKeys(config.LICENSE_TOKEN_SECRET, config.LICENSE_TOKEN_SECRET_PREVIOUS),
  );
  if (p.typ !== "license-lease") throw new Error("Invalid lease token type");
  return {
    licenseId: p.licenseId,
    tenantId: p.tenantId,
    deviceFingerprint: p.deviceFingerprint,
    plan: p.plan,
    seat: p.seat,
  };
}
