import { BrowserWindow, session } from "electron";
import { buildCsp } from "../config/csp";

// Allow only in-app origins to navigate. app:// in prod; dev server in dev.
export function shouldBlockNavigation(
  _current: string,
  target: string,
  dev: boolean,
): boolean {
  try {
    const u = new URL(target);
    if (u.protocol === "app:") return false;
    if (dev && u.host === "localhost:4000") return false;
    return true;
  } catch {
    return true;
  }
}

export function applyHardening(
  win: BrowserWindow,
  opts: { dev: boolean; apiOrigin: string },
): void {
  const wc = win.webContents;

  // Anti-capture: exclude from OS screen capture (Win/macOS).
  win.setContentProtection(true);

  // No popups / new windows.
  wc.setWindowOpenHandler(() => ({ action: "deny" }));

  // Block off-origin navigation.
  wc.on("will-navigate", (e, url) => {
    if (shouldBlockNavigation(wc.getURL(), url, opts.dev)) e.preventDefault();
  });

  // Prod: no DevTools, no right-click context menu.
  if (!opts.dev) {
    wc.on("devtools-opened", () => wc.closeDevTools());
    wc.on("context-menu", (e) => e.preventDefault());
  }

  // Strict CSP on every response for this window's session.
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          buildCsp({ apiOrigin: opts.apiOrigin, dev: opts.dev }),
        ],
      },
    });
  });
}
