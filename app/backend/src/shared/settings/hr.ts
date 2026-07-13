// src/shared/settings/hr.ts — HRM tenant settings namespace

import { z } from "zod";

export const hrSchema = z
  .object({
    defaultCountryPreset: z.string().length(2).default("BD"),
    fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
    payrollCycle: z.enum(["WEEKLY", "BI_WEEKLY", "MONTHLY"]).default("MONTHLY"),
    payrollCutoffDay: z.number().int().min(1).max(31).default(25),
    // Sunday=0 through Saturday=6 — array of working days.
    workWeekDays: z.array(z.number().int().min(0).max(6)).default([0, 1, 2, 3, 4]),
    attendanceGracePeriodMinutes: z.number().int().min(0).max(120).default(15),
    // SoD on payroll approval — processor ≠ approver.
    // Default true matches the inline default in payroll.service.
    payrollSoD: z.boolean().default(true),
  })
  .strict();

export type HrSettings = z.infer<typeof hrSchema>;
