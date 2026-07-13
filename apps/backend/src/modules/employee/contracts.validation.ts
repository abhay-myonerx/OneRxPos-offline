// EmploymentContract surface.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

const EMPLOYMENT_TYPES = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
  "TEMPORARY",
  "CONSULTANT",
] as const;

export const contractIdParamSchema = z.object({
  id: z.string().uuid("Invalid employee id"),
  contractId: z.string().uuid("Invalid contract id"),
});

export const contractListQuerySchema = createListQuerySchema({
  sortable: ["effectiveFrom", "createdAt"] as const,
  defaultSortBy: "effectiveFrom",
  defaultSortOrder: "desc",
  filters: z.object({
    active: z.coerce.boolean().optional(),
  }),
});

export const createContractSchema = z
  .object({
    contractNumber: z.string().trim().max(80).optional().nullable(),
    title: z.string().trim().min(1).max(200),
    employmentType: z.enum(EMPLOYMENT_TYPES),
    departmentId: z.string().uuid().optional().nullable(),
    designationId: z.string().uuid().optional().nullable(),
    storeId: z.string().uuid().optional().nullable(),
    reportsToId: z.string().uuid().optional().nullable(),
    salaryStructureId: z.string().uuid().optional().nullable(),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().optional().nullable(),
    documentUrl: z.string().url().optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    // When provided, the new contract supersedes the chain head
    // and the previous contract's effectiveTo gets set to
    // `effectiveFrom - 1 day` (handled in the service).
    supersedesId: z.string().uuid().optional().nullable(),
  })
  .strict()
  .refine((v) => !v.effectiveTo || v.effectiveTo >= v.effectiveFrom, {
    path: ["effectiveTo"],
    message: "Effective end must be on or after effective start",
  });
export type CreateContractInput = z.infer<typeof createContractSchema>;
