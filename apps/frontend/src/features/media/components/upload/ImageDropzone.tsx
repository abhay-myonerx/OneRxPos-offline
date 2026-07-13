"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { uploadToCloudinary, deleteFromCloudinary } from "@/lib/cloudinary/cloudinary.helpers";
import { Image } from "@/shell/media";

interface ImageDropzoneProps {
  value?: string | null;
  onUpload: (url: string) => void;
  onRemove?: () => void;
  className?: string;
  compact?: boolean;
  /** "circle" renders a round avatar-style preview/dropzone. Default: square. */
  shape?: "square" | "circle";
  /** If false, skip auto-delete of old images from Cloudinary. Default: true */
  autoDeleteOld?: boolean;
}

export function ImageDropzone({
  value,
  onUpload,
  onRemove,
  className,
  compact = false,
  shape = "square",
  autoDeleteOld = true,
}: ImageDropzoneProps) {
  const isCircle = shape === "circle";
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Auto-delete the old Cloudinary image if it exists.
   * Only deletes URLs from res.cloudinary.com to avoid deleting external URLs.
   */
  const cleanupOldImage = useCallback(
    async (oldUrl?: string | null) => {
      if (!autoDeleteOld || !oldUrl) return;
      if (!oldUrl.includes("res.cloudinary.com")) return;
      // Fire and forget — don't block the UI
      deleteFromCloudinary(oldUrl);
    },
    [autoDeleteOld],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Please upload an image file (JPG, PNG, WebP, GIF)");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be under 5MB");
        return;
      }

      setError(null);
      setIsUploading(true);
      setProgress(20);

      try {
        const interval = setInterval(() => {
          setProgress((p) => Math.min(p + 15, 85));
        }, 300);

        const url = await uploadToCloudinary(file);
        clearInterval(interval);
        setProgress(100);

        // Delete old image from Cloudinary if being replaced
        await cleanupOldImage(value);

        setTimeout(() => {
          onUpload(url);
          setIsUploading(false);
          setProgress(0);
        }, 300);
      } catch {
        setError("Upload failed. Check your Cloudinary config.");
        setIsUploading(false);
        setProgress(0);
      }
    },
    [onUpload, value, cleanupOldImage],
  );

  const handleRemove = useCallback(() => {
    // Delete from Cloudinary when removed
    cleanupOldImage(value);
    onRemove?.();
  }, [value, onRemove, cleanupOldImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  if (value && !isUploading) {
    return (
      <div
        className={cn(
          "relative group overflow-hidden border border-slate-200 dark:border-slate-700",
          isCircle ? "rounded-full" : "rounded-xl",
          compact ? "h-24 w-24" : "h-44",
          className,
        )}
      >
        <Image
          src={value}
          alt="Uploaded"
          className={cn(
            "h-full w-full",
            isCircle ? "object-cover" : "object-contain p-2 bg-slate-50/50 dark:bg-slate-800/50",
          )}
          width={100}
          height={100}
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-slate-700 hover:bg-white transition-colors"
            title="Replace image"
          >
            <Upload className="h-3.5 w-3.5" />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className="h-8 w-8 rounded-full bg-white/90 flex items-center justify-center text-danger-600 hover:bg-white transition-colors"
              title="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && inputRef.current?.click()}
        className={cn(
          "border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-2 cursor-pointer",
          isCircle ? "rounded-full" : "rounded-xl",
          compact ? "h-24 w-24 p-2" : "h-44 p-6",
          isDragging
            ? "border-primary-400 bg-primary-50/50 dark:bg-primary-400/10 scale-[1.01]"
            : "border-slate-300 dark:border-slate-700 hover:border-primary-400 hover:bg-slate-50 dark:hover:bg-slate-800/50",
          isUploading && "pointer-events-none opacity-70",
          error && "border-danger-400 bg-danger-50/30 dark:bg-danger-500/10",
        )}
      >
        {isUploading ? (
          <>
            <Loader2
              className={cn("animate-spin text-primary-500", compact ? "h-5 w-5" : "h-8 w-8")}
            />
            {!compact && (
              <>
                <p className="text-sm text-slate-600 font-medium">Uploading...</p>
                <div className="w-full max-w-[200px] h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div
              className={cn(
                "rounded-full bg-slate-100 flex items-center justify-center",
                compact ? "h-8 w-8" : "h-12 w-12",
              )}
            >
              <ImageIcon className={cn("text-slate-400", compact ? "h-4 w-4" : "h-6 w-6")} />
            </div>
            {!compact && (
              <div className="text-center">
                <p className="text-sm text-slate-600">
                  <span className="font-medium text-primary-600">Click to upload</span> or drag &
                  drop
                </p>
                <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP up to 5MB</p>
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-danger-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
