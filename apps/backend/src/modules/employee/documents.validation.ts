// EmployeeDocument surface.

import { z } from "zod";

import { createListQuerySchema } from "../../shared/utils/listQuery";

// Free-form string with curated examples in the deep-dive; the
// catalogue isn't enum-locked because tenants will want their own
// (visa, ID copy, signed contract, diploma, training cert, medical,
// reference letter, etc.). Min length 1 to forbid empty.
const documentTypeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(
    /^[A-Z0-9_-]+$/,
    "Document type must be uppercase alphanumeric (underscores/hyphens allowed)",
  );

export const docIdParamSchema = z.object({
  id: z.string().uuid("Invalid employee id"),
  docId: z.string().uuid("Invalid document id"),
});

export const documentListQuerySchema = createListQuerySchema({
  sortable: ["createdAt", "expiresAt", "documentType"] as const,
  defaultSortBy: "createdAt",
  defaultSortOrder: "desc",
  filters: z.object({
    documentType: documentTypeSchema.optional(),
    // ESS reads pass `confidentialOnly: false` (and the service
    // additionally enforces self-scope).
    includeConfidential: z.coerce.boolean().optional(),
  }),
});

export const uploadDocumentSchema = z
  .object({
    documentType: documentTypeSchema,
    fileName: z.string().trim().min(1).max(255),
    // The FE uploads the file to Cloudinary first (existing
    // MediaUpload component) and POSTs only the resulting URL.
    // We validate URL shape; presence of the file at that URL
    // is the FE's responsibility.
    fileUrl: z.string().url(),
    mimeType: z.string().trim().max(120).optional().nullable(),
    sizeBytes: z.number().int().positive().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
    isConfidential: z.boolean().default(false),
    notes: z.string().max(2000).optional().nullable(),
  })
  .strict();
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
