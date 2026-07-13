import { readFile } from "node:fs/promises";
import path from "node:path";
import { protocol } from "electron";
import type { CustomScheme } from "electron";
import { decryptRenderer } from "../security/renderer-crypto";

export const APP_SCHEME = "app";

export function privilegedSchemes(): CustomScheme[] {
  return [
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ];
}

// Pure security boundary: resolve an app:// URL to a real file path inside bundleDir,
// or null if the request is invalid, contains a ".." traversal segment, or escapes the
// bundle. We reject ".." on the RAW url first (WHATWG URL normalizes ".." inside the
// pathname before we ever see it, so a post-parse check alone would miss
// app://assets/../../secret), then double-check the resolved path stays under the root.
export function resolveRequestPath(
  bundleDir: string,
  requestUrl: string,
): string | null {
  let u: URL;
  try {
    u = new URL(requestUrl);
  } catch {
    return null;
  }
  let rawDecoded: string;
  try {
    rawDecoded = decodeURIComponent(requestUrl);
  } catch {
    return null; // malformed percent-encoding
  }
  // Any ".." segment (delimited by / or \ or the string ends) is a traversal attempt.
  if (/(^|[/\\])\.\.([/\\]|$)/.test(rawDecoded)) return null;

  // Resolve by PATHNAME only. The host (see APP_BUNDLE_HOST in urls.ts) is a
  // constant origin anchor, NOT a path segment — folding it into the path is
  // what made `app://bundle/assets/x.js` map to bundleDir/bundle/assets/x.js.
  // An empty pathname (`app://bundle` / `app://bundle/`) serves index.html.
  const rel =
    decodeURIComponent(u.pathname.replace(/^\/+/, "").replace(/\/+$/, "")) ||
    "index.html";
  const resolved = path.resolve(bundleDir, rel);
  const root = path.resolve(bundleDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

// Read a bundle file, decrypting when the build embedded an encryption key.
// The cast narrows `Buffer<ArrayBufferLike>` (decryptRenderer's declared
// return type, and the bare `Buffer` alias's default generic param) to
// `Buffer<ArrayBuffer>`, which is what `new Response(...)` requires under
// the DOM lib's `BodyInit`/`ArrayBufferView` typing. Both `readFile` and
// `decryptRenderer` only ever back their buffers with a real (non-shared)
// ArrayBuffer, so the narrowing is always accurate at runtime.
export async function readFileFromBundle(
  filePath: string,
  decryptKey?: Buffer,
): Promise<Buffer<ArrayBuffer>> {
  const raw = await readFile(filePath);
  return (decryptKey ? decryptRenderer(raw, decryptKey) : raw) as Buffer<ArrayBuffer>;
}

export function registerAppProtocol(
  bundleDir: string,
  opts?: { decryptKey?: Buffer },
): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveRequestPath(bundleDir, request.url);
    if (!filePath) return new Response("Forbidden", { status: 403 });
    try {
      const body = await readFileFromBundle(filePath, opts?.decryptKey);
      const type =
        CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
        "application/octet-stream";
      return new Response(body, { headers: { "content-type": type } });
    } catch {
      // SPA fallback: unknown non-asset path -> index.html (HashRouter handles the route).
      if (!path.extname(filePath)) {
        const index = await readFileFromBundle(
          path.join(bundleDir, "index.html"),
          opts?.decryptKey,
        );
        return new Response(index, {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    }
  });
}
