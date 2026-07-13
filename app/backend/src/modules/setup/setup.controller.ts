import { Request, Response, NextFunction } from "express";
import * as setupService from "./setup.service";
import { config } from "../../config";

const COOKIE_NAME = "pos_refresh_token";
const isProd = config.NODE_ENV === "production";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

export async function status(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await setupService.getStatus();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await setupService.complete(req.body);
    // Match auth.controller behaviour: refresh token in httpOnly cookie,
    // never returned in body.
    res.cookie(COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _rt, ...safeResult } = result;
    res.status(201).json({ success: true, data: safeResult });
  } catch (error) {
    next(error);
  }
}
