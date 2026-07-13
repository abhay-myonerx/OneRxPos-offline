/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useState, useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const BANNER_DISMISSED_KEY = "pos_demo_banner_dismissed";
const BANNER_H = 40;

const CODECANYON_URL = process.env.NEXT_PUBLIC_CODECANYON_URL;

export function DemoBanner() {
  const { isDemoMode } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isDemoMode) return;
    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (!dismissed) setVisible(true);
  }, [isDemoMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--demo-banner-h", visible ? `${BANNER_H}px` : "0px");
    return () => root.style.setProperty("--demo-banner-h", "0px");
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
  };

  if (!visible) return null;

  return (
    <>
      <style jsx global>{`
        @keyframes demo-shimmer {
          0% {
            background-position: -200% center;
          }
          100% {
            background-position: 200% center;
          }
        }
        @keyframes demo-pulse-ring {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
        @keyframes demo-slide-in {
          from {
            transform: translateY(-100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>

      <div
        className="fixed top-0 left-0 right-0 z-[70] flex items-center justify-between px-4 sm:px-5"
        style={{
          height: `${BANNER_H}px`,
          background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 40%, #16213e 70%, #0f0f0f 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          animation: "demo-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Subtle top-edge highlight */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height: "1px",
            background:
              "linear-gradient(90deg, transparent, rgba(99,102,241,0.4) 30%, rgba(168,85,247,0.4) 70%, transparent)",
          }}
        />

        {/* Left: live indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Pulse dot */}
          <span className="relative flex h-[7px] w-[7px]">
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "#34d399",
                animation: "demo-pulse-ring 1.8s ease-out infinite",
              }}
            />
            <span
              className="relative inline-flex rounded-full h-[7px] w-[7px]"
              style={{
                background: "#34d399",
                boxShadow: "0 0 6px rgba(52,211,153,0.5)",
              }}
            />
          </span>

          {/* LIVE badge */}
          <span
            className="hidden sm:inline-flex items-center px-2 py-[2px] rounded text-[10px] tracking-[0.12em] uppercase"
            style={{
              fontWeight: 600,
              color: "#34d399",
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.15)",
              letterSpacing: "0.12em",
              fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
            }}
          >
            Live
          </span>
        </div>

        {/* Center: message */}
        <p
          className="flex-1 text-center text-[12px] sm:text-[13px] px-3 sm:px-4 truncate"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontWeight: 400,
            letterSpacing: "0.01em",
          }}
        >
          You&apos;re exploring the demo
          <span
            className="hidden sm:inline"
            style={{ color: "rgba(255,255,255,0.25)", margin: "0 6px" }}
          >
            ·
          </span>
          <span className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.4)" }}>
            Data resets every 2 hours
          </span>
        </p>

        {/* Right: CTA + dismiss */}
        <div className="flex items-center gap-2 shrink-0">
          {CODECANYON_URL && (
            <a
              href={CODECANYON_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-[5px] rounded-md text-[11px] font-semibold tracking-wide transition-all duration-200 group"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(168,85,247,0.9))",
                color: "#ffffff",
                boxShadow: "0 1px 3px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
                letterSpacing: "0.03em",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(135deg, rgba(99,102,241,1), rgba(168,85,247,1))";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 2px 8px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-0.5px)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background =
                  "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(168,85,247,0.9))";
                (e.currentTarget as HTMLElement).style.boxShadow =
                  "0 1px 3px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.1)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              }}
            >
              Get License
              <ArrowRight
                className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </a>
          )}

          <button
            onClick={dismiss}
            className="h-6 w-6 rounded flex items-center justify-center transition-all duration-150"
            style={{ color: "rgba(255,255,255,0.25)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)";
            }}
            aria-label="Dismiss banner"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
      </div>
    </>
  );
}
