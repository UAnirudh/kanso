/** @type {import("next").NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// The App Router hydrates through inline bootstrap scripts, and React style
// attributes are inline: a CSP without `'unsafe-inline'` breaks the app unless a
// per-request nonce is threaded through middleware (ADR-11). External scripts are
// still blocked, and frame-ancestors/object-src/base-uri keep their full meaning.
// Dev also needs `'unsafe-eval'` for eval source maps and a websocket for HMR.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Local development is reached over 127.0.0.1 as well as localhost in CI.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  poweredByHeader: false,
  // The dev indicator covers the sidebar footer in screenshots and demos.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          // frame-ancestors above is the modern control; these are the legacy and
          // defence-in-depth headers that older clients and scanners still read.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // HSTS is meaningless (and awkward to undo) on the plain-HTTP dev server,
          // so it ships only in the production build, which Render serves over TLS.
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;
