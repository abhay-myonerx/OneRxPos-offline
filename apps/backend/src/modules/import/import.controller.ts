// 3H.3 catalog import HTTP layer. One endpoint: dryRun → plan (preview), else commit.

import { Request, Response, NextFunction } from "express";
import { importRequestSchema } from "./import.validation";
import { planImport, commitImport } from "./import.service";

export async function importCatalog(req: Request, res: Response, next: NextFunction) {
  try {
    const { mode, rows, options, dryRun } = importRequestSchema.parse(req.body);
    const args = { mode, rows, options };
    const data = dryRun
      ? await planImport(req.db!, req.tenantId!, args)
      : await commitImport(req.db!, req.tenantId!, args);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
