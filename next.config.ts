import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // These load workers and native helpers at runtime, so they must not be bundled.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "mammoth"],
};

export default withNextIntl(nextConfig);
