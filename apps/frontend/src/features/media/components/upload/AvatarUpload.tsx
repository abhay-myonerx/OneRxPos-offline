"use client";

import { useState } from "react";
import { Link as LinkIcon, Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { ImageDropzone } from "./ImageDropzone";

function isCloudinaryUrl(u?: string | null): boolean {
  return !!u && u.includes("res.cloudinary.com");
}

interface AvatarUploadProps {
  value?: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  /** Show the Upload / URL toggle. Default: true. */
  allowUrl?: boolean;
  urlPlaceholder?: string;
  className?: string;
}

/**
 * Compact, avatar-style photo picker. Renders a small round preview that the
 * user clicks (or drops onto) to upload, with an optional "URL" tab for
 * pasting a public image link. Designed for profile photos so the field no
 * longer takes a full-width drop box.
 */
export function AvatarUpload({
  value,
  onUpload,
  onRemove,
  allowUrl = true,
  urlPlaceholder = "https://example.com/photo.jpg",
  className,
}: AvatarUploadProps) {
  const [tab, setTab] = useState<"upload" | "url">(
    value && !isCloudinaryUrl(value) ? "url" : "upload",
  );
  const [urlDraft, setUrlDraft] = useState<string | null>(null);

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
    <div className={cn("flex items-center gap-5", className)}>
      <ImageDropzone
        compact
        shape="circle"
        value={value ?? undefined}
        onUpload={onUpload}
        onRemove={onRemove}
      />

      <div className="min-w-0 flex-1 space-y-2">
        {allowUrl && (
          <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 p-0.5">
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
        )}

        {allowUrl && tab === "url" ? (
          <Input
            type="url"
            value={urlDraft ?? (value && !isCloudinaryUrl(value) ? value : "")}
            placeholder={urlPlaceholder}
            onChange={(e) => commitUrl(e.target.value)}
            prefixIcon={<LinkIcon />}
          />
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">JPG, PNG, or WebP · max 5 MB</p>
        )}
      </div>
    </div>
  );
}
