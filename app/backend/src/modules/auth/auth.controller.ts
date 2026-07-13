import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import { config } from "../../config";
import { prisma } from "../../config/database";
import { resolveUserPermissionsArray } from "../../shared/permissions/resolver";
import { getDiscountCaps } from "../../shared/settings/discount-caps";
import { readEnabledSectors } from "../../shared/settings";

// Cookie configuration — centralised so all handlers use identical settings
const COOKIE_NAME = "pos_refresh_token";
const isProd = config.NODE_ENV === "production";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

/** Set the refresh token cookie on the response */
function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(COOKIE_NAME, refreshToken, COOKIE_OPTIONS);
}

/** Clear the refresh token cookie.
 *  maxAge is excluded — clearCookie already sets Expires to epoch, and
 *  including maxAge can conflict with that header in some cookie clients. */
function clearRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...clearOptions } = COOKIE_OPTIONS;
  res.clearCookie(COOKIE_NAME, clearOptions);
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    // Set refresh token in httpOnly cookie — never expose it in the response body
    setRefreshCookie(res, result.refreshToken);
    // Return everything except the refresh token
    const { refreshToken: _rt, ...safeResult } = result;
    res.status(201).json({ success: true, data: safeResult });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    // Set refresh token in httpOnly cookie — never expose it in the response body
    setRefreshCookie(res, result.refreshToken);
    // Return everything except the refresh token
    const { refreshToken: _rt, ...safeResult } = result;
    res.json({ success: true, data: { ...safeResult, isDemoMode: config.DEMO_MODE } });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (!refreshToken) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "No refresh token" },
      });
      return;
    }
    const result = await authService.refresh(refreshToken);
    // Rotate: issue a new refresh token cookie
    setRefreshCookie(res, result.refreshToken);
    // Only return the new access token to the client
    res.json({ success: true, data: { accessToken: result.accessToken } });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    // Read from httpOnly cookie
    const refreshToken = req.cookies?.[COOKIE_NAME];
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    // Always clear the cookie, even if the token was already expired/invalid
    clearRefreshCookie(res);
    res.json({ success: true, data: { message: "Logged out" } });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.changePassword(req.user!.id, req.body);
    // Revoke all sessions — also clear their cookie
    clearRefreshCookie(res);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const permissions = req.user ? resolveUserPermissionsArray(req.user) : [];
    // Surface preferences (JSONB) + employeeId + discountCaps on /auth/me
    // so the FE doesn't need a second fetch to know whether ESS endpoints
    // are usable, can apply persisted theme/locale on initial render, AND
    // (ring-up gating) can read the caller's role's discount cap without a
    // separate tenant-settings round-trip. /auth/me is the one payload every
    // authenticated role (including CASHIER) already fetches on session
    // bootstrap — unlike GET /tenant/me/settings, which requires
    // tenant:manage and is ADMIN-only.
    let preferences: Record<string, unknown> = {};
    let employeeId: string | null = null;
    let discountCaps = getDiscountCaps(null);
    // Which SECTORS this tenant has enabled (pharmacy = plugin #1, Phase 2).
    // The FE gates the Drug-identity UI on `enabledSectors.pharmacy`; surfacing
    // it here (like discountCaps) avoids a separate ADMIN-only settings fetch.
    let enabledSectors = readEnabledSectors({ settings: null });
    if (req.user) {
      const row = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          preferences: true,
          employeeId: true,
          tenant: { select: { settings: true } },
        },
      });
      preferences = (row?.preferences ?? {}) as Record<string, unknown>;
      employeeId = row?.employeeId ?? null;
      discountCaps = getDiscountCaps(row?.tenant.settings ?? null);
      enabledSectors = readEnabledSectors({ settings: row?.tenant.settings ?? null });
    }
    res.json({
      success: true,
      data: {
        user: req.user ? { ...req.user, permissions, preferences, employeeId } : null,
        isDemoMode: config.DEMO_MODE,
        discountCaps,
        enabledSectors,
      },
    });
  } catch (error) {
    next(error);
  }
}
