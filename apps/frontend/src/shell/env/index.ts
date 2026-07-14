import type { AppEnv } from "./types";

function resolveApiUrl(): string {
  // Electron
  if (typeof window !== "undefined") {
    const origin = window.rxpos?.apiOrigin;
    if (origin) {
      return `${origin}/api/v1`;
    }
  }

  // Next.js
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api/v1";
}

export const env: AppEnv = {
  apiUrl: resolveApiUrl(),
  cloudinaryCloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "",
  cloudinaryUploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "",
};
