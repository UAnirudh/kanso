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
};

export default nextConfig;
