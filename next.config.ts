import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep Turbopack rooted at HajiHazai even though a stray user-level
  // package-lock.json exists in ~/; this removes ambiguous workspace detection.
  turbopack: { root: process.cwd() },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
});
