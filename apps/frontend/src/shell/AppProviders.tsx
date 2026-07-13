"use client";

// Shared provider tree used by BOTH shells: the Next.js app/layout.tsx and
// the Vite/React-Router SPA entry (main.tsx). Keep this Next-agnostic — it
// must not import next/* directly. Anything genuinely Next-only (html/body
// shell, next/font, metadata, global CSS import) stays in app/layout.tsx.
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { Toaster } from "react-hot-toast";
import { store } from "@/store";
import { AuthAwareToast } from "@/components/shared/feedback/AuthAwareToast";
import { SetupGuard } from "@/components/shared/setup/SetupGuard";
import { ThemeProvider } from "@/components/shared/theme/ThemeProvider";
import { LocaleProvider } from "@/components/shared/i18n/LocaleProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <LocaleProvider>
          <SetupGuard>{children}</SetupGuard>
          <AuthAwareToast />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              // Theme-aware via CSS custom properties driven by the `.dark`
              // class on <html> (see globals.css). Keeps toasts legible in
              // both themes without re-rendering on theme change.
              style: {
                background: "var(--toast-bg)",
                color: "var(--toast-fg)",
                border: "1px solid var(--toast-border)",
                borderRadius: "12px",
                fontSize: "14px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              },
              success: { iconTheme: { primary: "#10b981", secondary: "#fff" } },
              error: { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
            }}
          />
        </LocaleProvider>
      </ThemeProvider>
    </Provider>
  );
}
