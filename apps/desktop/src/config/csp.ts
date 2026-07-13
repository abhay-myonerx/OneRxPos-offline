// Single authoritative CSP for the shell. app: is our packaged-bundle origin.
export function buildCsp(opts: { apiOrigin: string; dev: boolean }): string {
  const devConnect = opts.dev
    ? " http://localhost:4000 ws://localhost:4000"
    : "";
  const scriptExtra = opts.dev ? " 'unsafe-eval' 'unsafe-inline'" : "";
  return [
    "default-src 'self' app:",
    `script-src 'self' app:${scriptExtra}`,
    "style-src 'self' app: 'unsafe-inline'",
    "img-src 'self' app: data: blob: https:",
    "font-src 'self' app: data:",
    `connect-src 'self' app: ${opts.apiOrigin} https: wss: ws:${devConnect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
