// Express handlers for user management

import { Request, Response, NextFunction } from "express";
import * as userService from "./user.service";
import { paginationSchema } from "../../shared/utils/pagination";

// ── List users ──────────────────────────────────────────────────────────────

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const pagination = paginationSchema.parse(req.query);

    const filters = {
      search: req.query.search as string | undefined,
      role: req.query.role as string | undefined,
      storeId: req.query.storeId as string | undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };

    const result = await userService.listUsers(
      req.db!,
      req.user!.role,
      req.user!.storeId,
      filters,
      pagination,
    );

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

// ── Get user by ID ──────────────────────────────────────────────────────────

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.getUserById(
      req.db!,
      req.params.id as string,
      req.user!.role,
      req.user!.storeId,
    );

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

// ── Create user ─────────────────────────────────────────────────────────────

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.createUser(
      req.db!,
      req.user!.tenantId,
      req.user!.role,
      req.user!.storeId,
      req.body,
    );

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

// ── Update user ─────────────────────────────────────────────────────────────

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userService.updateUser(
      req.db!,
      req.params.id as string,
      req.user!.role,
      req.user!.storeId,
      req.user!.id,
      req.body,
    );

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

// ── Reset password ──────────────────────────────────────────────────────────

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.resetPassword(
      req.db!,
      req.params.id as string,
      req.user!.role,
      req.body,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Delete user (soft delete) ───────────────────────────────────────────────

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.deleteUser(
      req.db!,
      req.params.id as string,
      req.user!.role,
      req.user!.id,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Restore user ────────────────────────────────────────────────────────────

export async function restore(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.restoreUser(
      req.db!,
      req.params.id as string,
      req.user!.role,
      req.user!.id,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// ── Update own profile ──────────────────────────────────────────────────────

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.updateOwnProfile(req.db!, req.user!.id, req.body);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
