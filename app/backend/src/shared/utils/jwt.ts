import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";
import { config } from "../../config";
import { verifyWithRotation, rotationKeys } from "./token-rotation";

export interface TokenPayload {
  sub: string; // user id
  tenantId: string;
  storeId: string | null;
  storeIds: string[];
  role: string;
  email: string;
  firstName: string;
  lastName: string;
}

export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRY,
  } as SignOptions);
}

export function signRefreshToken(payload: Pick<TokenPayload, "sub">): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRY,
  } as SignOptions);
}

export function verifyAccessToken(token: string): TokenPayload {
  return verifyWithRotation<TokenPayload>(
    token,
    rotationKeys(config.JWT_ACCESS_SECRET, config.JWT_ACCESS_SECRET_PREVIOUS),
  );
}

export function verifyRefreshToken(token: string): JwtPayload & { sub: string } {
  return verifyWithRotation<JwtPayload & { sub: string }>(
    token,
    rotationKeys(config.JWT_REFRESH_SECRET, config.JWT_REFRESH_SECRET_PREVIOUS),
  );
}
