"use client";

import { useState } from "react";
import { Link as LinkIcon, Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "./ImageDropzone";

function isCloudinaryUrl(u?: string | null): boolean {
  return !!u && u.includes("res.cloudinary.com");
}

interface MediaUploadProps {
  value?: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  compact?: boolean;
  className?: string;
  /**
   * When true, render a small tab strip that lets the user switch between
   * "Upload" (file → Cloudinary) and "URL" (paste any image URL).
   * The selected URL is reported through `onUpload` exactly like a Cloudinary
   * upload, so callers don't need to branch.
   */
  allowUrl?: boolean;
  /** Placeholder text for the URL input when `allowUrl` is on. */
  urlPlaceholder?: string;
}

/**
 * Convenience wrapper around ImageDropzone for consistent usage across the app.
 * Handles Cloudinary uploads via unsigned upload preset, and — when
 * `allowUrl` is true — also accepts a pasted image URL as the value.
 */
export function MediaUpload({
  value,
  onUpload,
  onRemove,
  compact,
  className,
  allowUrl = false,
  urlPlaceholder = "https://example.com/photo.jpg",
}: MediaUploadProps) {
  const initialTab: "upload" | "url" = value && !isCloudinaryUrl(value) ? "url" : "upload";
  const [tab, setTab] = useState<"upload" | "url">(initialTab);
  // Local typing buffer — only meaningful while the URL tab is active and
  // the user is mid-edit. When the parent's `value` is a non-Cloudinary URL
  // we display it directly from `value`, falling back to the local draft
  // only for in-progress strings that haven't passed the http(s) check yet.
  const [urlDraft, setUrlDraft] = useState<string | null>(null);

  if (!allowUrl) {
    return (
      <ImageDropzone
        value={value}
        onUpload={onUpload}
        onRemove={onRemove}
        compact={compact}
        className={className}
      />
    );
  }

  function commitUrl(next: string) {
    const trimmed = next.trim();
    setUrlDraft(trimmed);
    if (!trimmed) {
      onRemove?.();
      return;
    }
    if (!/^https?:\/\/\S+/i.test(trimmed)) return;
    onUpload(trimmed);
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="inline-flex items-center gap-1 self-start rounded-md bg-slate-100 dark:bg-slate-800 p-0.5">
        <button
          type="button"
          onClick={() => setTab("upload")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
            tab === "upload"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload
        </button>
        <button
          type="button"
          onClick={() => setTab("url")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors",
            tab === "url"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
          )}
        >
          <LinkIcon className="h-3.5 w-3.5" />
          URL
        </button>
      </div>

      {tab === "upload" ? (
        <ImageDropzone
          value={value && value.includes("res.cloudinary.com") ? value : undefined}
          onUpload={onUpload}
          onRemove={onRemove}
          compact={compact}
        />
      ) : (
        <Input
          type="url"
          value={urlDraft ?? (value && !isCloudinaryUrl(value) ? value : "")}
          placeholder={urlPlaceholder}
          onChange={(e) => commitUrl(e.target.value)}
          prefixIcon={<LinkIcon />}
        />
      )}
    </div>
  );
}
