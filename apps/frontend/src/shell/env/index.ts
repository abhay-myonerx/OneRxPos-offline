import type { AppEnv } from "./types";

// Next shell: values are inlined from NEXT_PUBLIC_* at build time.
export const env: AppEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api/v1",
  cloudinaryCloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "",
  cloudinaryUploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "",
};
