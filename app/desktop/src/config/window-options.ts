import type { BrowserWindowConstructorOptions } from "electron";

// Central hardening: every renderer window is created from this. Flags mirror spec §7.4.
export function buildWindowOptions(opts: {
  preloadPath: string;
  kiosk: boolean;
}): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    show: false, // shown on ready-to-show to avoid a white flash
    kiosk: opts.kiosk,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: opts.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  };
}
