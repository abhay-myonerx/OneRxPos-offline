import { NextRequest, NextResponse } from "next/server";
import { env } from "@/shell/env";

const CLOUD_NAME = env.cloudinaryCloudName;
const API_KEY = process.env.CLOUDINARY_API_KEY || "";
const API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

/**
 * POST /api/cloudinary/delete
 * Body: { publicId: string }
 *
 * Deletes an image from Cloudinary using signed Admin API.
 * This runs server-side so the API_SECRET is never exposed to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const { publicId } = await req.json();

    if (!publicId || typeof publicId !== "string") {
      return NextResponse.json({ error: "publicId is required" }, { status: 400 });
    }

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return NextResponse.json({ error: "Cloudinary not configured" }, { status: 500 });
    }

    const timestamp = Math.round(Date.now() / 1000);

    // Cloudinary requires: sha1("public_id=xxx&timestamp=xxx" + API_SECRET)
    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const formData = new FormData();
    formData.append("public_id", publicId);
    formData.append("timestamp", String(timestamp));
    formData.append("api_key", API_KEY);
    formData.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`, {
      method: "POST",
      body: formData,
    });

    const result = await res.json();

    if (result.result === "ok" || result.result === "not found") {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Delete failed", detail: result }, { status: 500 });
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
