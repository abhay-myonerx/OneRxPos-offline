import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "./cloudinary.constants";
import type { CloudinaryUploadResult } from "./cloudinary.types";

/**
 * Upload image to Cloudinary (unsigned, client-side).
 * Returns full upload result including public_id for later deletion.
 */
export async function uploadToCloudinaryFull(file: File): Promise<CloudinaryUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Cloudinary upload failed");

  const data = await res.json();
  return {
    secure_url: data.secure_url,
    public_id: data.public_id,
    width: data.width,
    height: data.height,
    format: data.format,
  };
}

/**
 * Simple upload returning just the URL (backward-compatible).
 */
export async function uploadToCloudinary(file: File): Promise<string> {
  const result = await uploadToCloudinaryFull(file);
  return result.secure_url;
}

/**
 * Extract Cloudinary public_id from a secure_url.
 * e.g. "https://res.cloudinary.com/demo/image/upload/v12345/folder/my-image.jpg"
 *   → "folder/my-image"
 */
export function extractPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

/**
 * Delete image from Cloudinary via our Next.js API route (server-side signed).
 * Call this when an uploaded image is no longer needed (replaced or removed).
 */
export async function deleteFromCloudinary(url: string): Promise<boolean> {
  const publicId = extractPublicId(url);
  if (!publicId) return false;

  try {
    const res = await fetch("/api/cloudinary/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicId }),
    });
    return res.ok;
  } catch {
    // Silently fail — orphaned images are cleaned up by Cloudinary admin later
    console.warn("Failed to delete Cloudinary image:", publicId);
    return false;
  }
}
