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
  // The database bootstrap (src/instrumentation.ts → src/db/bootstrap.ts) reads
  // the committed ./drizzle migration folder at runtime through `fs`, using a
  // path built from `process.cwd()`. Output file tracing cannot follow
  // runtime-constructed paths, so without this entry the folder is silently
  // left out of serverless bundles (Vercel) — migrations then fail with
  // "Can't find meta/_journal.json file", no table is ever created, and the
  // first API query dies with 42P01 "relation does not exist". Every server
  // function runs the instrumentation hook on cold start, so every function
  // needs the folder — hence the catch-all route glob.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
  },
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
