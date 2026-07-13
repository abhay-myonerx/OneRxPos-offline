import { env } from "@/shell/env";

// Client-side (safe to expose)
export const CLOUDINARY_CLOUD_NAME = env.cloudinaryCloudName;
export const CLOUDINARY_UPLOAD_PRESET = env.cloudinaryUploadPreset;

// Server-side only (used in API route for deletion)
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";
