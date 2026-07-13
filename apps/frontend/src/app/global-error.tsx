"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown in the root layout itself, where
 * the normal app shell (and its CSS/providers) may be unavailable. It renders
 * its own <html>/<body>, so everything here is inline-styled to stay reliable
 * regardless of stylesheet state.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, #eef2ff 0%, #f8fafc 55%)",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "20px",
            padding: "40px 32px",
            boxShadow: "0 20px 45px -20px rgba(15,23,42,0.25)",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 20px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fef2f2",
              border: "1px solid #fee2e2",
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#94a3b8",
            }}
          >
            Application error
          </p>
          <h1
            style={{
              margin: "8px 0 0",
              fontSize: "22px",
              fontWeight: 600,
              color: "#0f172a",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            RX POS ran into an unexpected problem. Please try again — if it keeps happening, reload
            the app.
          </p>

          <div
            style={{
              marginTop: "28px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                border: "1px solid #1a1a2e",
                background: "#1a1a2e",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 500,
                padding: "10px 18px",
                borderRadius: "10px",
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                cursor: "pointer",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#334155",
                fontSize: "14px",
                fontWeight: 500,
                padding: "10px 18px",
                borderRadius: "10px",
              }}
            >
              Reload app
            </button>
          </div>

          {error.digest && (
            <p
              style={{
                margin: "20px 0 0",
                fontSize: "12px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                color: "#94a3b8",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
