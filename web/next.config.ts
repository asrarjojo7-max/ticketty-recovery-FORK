import type { NextConfig } from "next";

// React's DEVELOPMENT build requires eval() (stack-frame reconstruction and
// the dev indicator); the production build does not. 'unsafe-eval' is added
// to script-src only for the dev server so development is clean while the
// production CSP stays fully hardened.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Next.js 16 dev servers block cross-origin requests to /_next/* assets
  // (block-cross-site-dev) for CSRF safety. The dev preview is served through
  // a Cloudflare tunnel on this domain, so its Origin header must be
  // allowlisted or hydration fails (the login form then falls back to a
  // native GET submission and leaks credentials into the URL — see the
  // security incident of 2026-09-07).
  allowedDevOrigins: process.env.DEV_ALLOWED_ORIGINS
    ? process.env.DEV_ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : ["app.suda-technologies.com"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // Dev-server asset URLs are not content-hashed, so intermediate caches
        // (Cloudflare in front of the tunnel, browsers) must always
        // revalidate them — otherwise code changes stay invisible for hours on
        // the preview domain while the local server already serves them.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
