import { z } from "zod";
import { isValidLicenseKey } from "@/licensing/license-key";

const key = z.string().refine(isValidLicenseKey, { message: "Invalid license key" });
const fingerprint = z.string().min(16);

export const activateSchema = z.object({ key, fingerprint, storeId: z.string().optional() });
export const validateSchema = z.object({ key, fingerprint });
