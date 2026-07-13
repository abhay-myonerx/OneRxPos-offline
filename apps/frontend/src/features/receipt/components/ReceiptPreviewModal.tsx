// Full-screen receipt preview with print and image download actions

"use client";

import { useEffect, useRef, useState } from "react";
import { X, Printer, ImageDown, Copy, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLazyGetReceiptHtmlQuery } from "../api/receipt.api";
import { showApiError, showSuccess } from "@/lib/api/error-handler";

interface ReceiptPreviewModalProps {
  open: boolean;
  onClose: () => void;
  saleId: string | null;
  invoiceNo?: string;
  duplicate?: boolean;
}

export function ReceiptPreviewModal({
  open,
  onClose,
  saleId,
  invoiceNo,
  duplicate = false,
}: ReceiptPreviewModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [safeHtml, setSafeHtml] = useState<string | null>(null);
  const [triggerFetch, { data: html, isLoading, isError, error }] = useLazyGetReceiptHtmlQuery();

  useEffect(() => {
    if (open && saleId) {
      triggerFetch({ saleId, duplicate });
    }
  }, [open, saleId, duplicate, triggerFetch]);

  // Sanitize the server-fetched receipt HTML before it is ever rendered or
  // written into the DOM. DOMPurify is imported dynamically so it always runs
  // client-side with a real `window` (a top-level import in this client
  // component would be created during SSR without a DOM and silently no-op).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!html) {
        if (!cancelled) setSafeHtml(null);
        return;
      }
      const DOMPurify = (await import("dompurify")).default;
      const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true });
      if (!cancelled) setSafeHtml(clean);
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (safeHtml && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(safeHtml);
        doc.close();
      }
    }
  }, [safeHtml]);

  useEffect(() => {
    if (isError) showApiError(error);
  }, [isError, error]);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadImage = async () => {
    if (!safeHtml) return;
    setDownloading(true);

    try {
      const html2canvas = (await import("html2canvas")).default;

      // Create an off-screen container to render the receipt HTML
      const container = document.createElement("div");
      container.style.cssText =
        "position:fixed;left:-9999px;top:0;width:320px;background:#fff;z-index:-1;";
      document.body.appendChild(container);

      // Create a shadow root to isolate receipt styles from the app
      const shadow = container.attachShadow({ mode: "open" });
      const wrapper = document.createElement("div");
      // safeHtml is already sanitized by DOMPurify above.
      wrapper.innerHTML = safeHtml;
      shadow.appendChild(wrapper);

      // Wait for images / fonts to settle
      await new Promise((r) => setTimeout(r, 500));

      const canvas = await html2canvas(wrapper, {
        backgroundColor: "#ffffff",
        scale: 2, // 2x for crisp output
        useCORS: true,
        logging: false,
        width: 320,
        windowWidth: 320,
      });

      // Convert to PNG blob and trigger download
      canvas.toBlob((blob) => {
        if (!blob) {
          showApiError({ error: "Failed to generate image" });
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `receipt-${invoiceNo || saleId || "unknown"}.png`;
        a.click();
        URL.revokeObjectURL(url);
        showSuccess("Receipt image downloaded");
      }, "image/png");

      // Clean up
      document.body.removeChild(container);
    } catch {
      showApiError({ error: "Failed to generate receipt image" });
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyHtml = async () => {
    if (!safeHtml) return;
    try {
      await navigator.clipboard.writeText(safeHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showApiError({ error: "Failed to copy" });
    }
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === overlayRef.current && onClose()}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />

      <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl animate-scale-in flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary-50 dark:bg-primary-500/15 flex items-center justify-center">
              <Printer className="h-4.5 w-4.5 text-primary-600 dark:text-primary-300" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-slate-800 dark:text-slate-100">
                Receipt Preview
              </h2>
              {invoiceNo && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {invoiceNo}
                  {duplicate ? " — DUPLICATE" : ""}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Receipt iframe */}
        <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-6">
          {isLoading || (html && !safeHtml) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Generating receipt...</p>
            </div>
          ) : safeHtml ? (
            <div
              /* Printed receipt — always white paper, even in dark mode */
              className="mx-auto bg-white shadow-lg rounded-lg overflow-hidden"
              style={{ maxWidth: "320px" }}
            >
              <iframe
                ref={iframeRef}
                title="Receipt Preview"
                className="w-full border-0"
                style={{ minHeight: "500px", height: "auto" }}
                onLoad={() => {
                  if (iframeRef.current?.contentDocument?.body) {
                    const h = iframeRef.current.contentDocument.body.scrollHeight;
                    iframeRef.current.style.height = `${h + 20}px`;
                  }
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-slate-400 dark:text-slate-500">No receipt to display</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 rounded-b-2xl shrink-0">
          <Button variant="ghost" size="sm" onClick={handleCopyHtml} disabled={!safeHtml}>
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-success-600" /> Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy HTML
              </>
            )}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadImage}
              disabled={!safeHtml || downloading}
              loading={downloading}
              icon={<ImageDown className="h-4 w-4" />}
            >
              Save Image
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={!safeHtml}
              icon={<Printer className="h-4 w-4" />}
            >
              Print
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
