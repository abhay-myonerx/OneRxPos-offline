import type { NextConfig } from "next";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:5000";

const isProd = process.env.NODE_ENV === "production";

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP — start permissive enough to ship; tighten as the bundle stabilises.
  // Keep 'unsafe-inline' and 'unsafe-eval' in dev so Fast Refresh / DevTools
  // still work; lock them down in prod build.
  {
    key: "Content-Security-Policy",
    value: [
      `default-src 'self'`,
      `script-src 'self'${isProd ? "" : " 'unsafe-eval' 'unsafe-inline'"} 'unsafe-inline'`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: https://res.cloudinary.com https://i.ibb.co.com`,
      `font-src 'self' data:`,
      `connect-src 'self' ${API_ORIGIN} https: wss: ws:`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `object-src 'none'`,
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // rx-pos-shared publishes TypeScript source (no build step) — Next does not
  // transpile node_modules by default, so without this the Next build would
  // fail to consume the package.
  transpilePackages: ["rx-pos-shared"],
  // Emit a self-contained server bundle (.next/standalone) so the Docker
  // production image stays small and starts with a single `node server.js`.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "i.ibb.co.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
