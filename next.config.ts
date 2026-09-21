import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production hardening — behaviour is identical in development.
  allowedDevOrigins:
  ["10.22.83.179"],
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
