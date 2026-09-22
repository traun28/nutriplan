import type { NextConfig } from "next";

/**
 * Extra origins allowed to reach the *development* server (e.g. testing on a
 * phone over the LAN: `DEV_ALLOWED_ORIGINS=192.168.1.20`). Comma-separated,
 * ignored by `next build` / `next start`.
 */
const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Production hardening — behaviour is identical in development.
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  images: {
    // Only local images are served; no remote hosts are allowed.
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
