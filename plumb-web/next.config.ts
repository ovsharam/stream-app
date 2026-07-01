import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async rewrites() {
    const railwayUrl = process.env.STREAM_API_URL ?? "https://api.useplumb.ai";
    return [
      {
        // All /api/stream/* traffic that doesn't match a Next.js route proxies to Railway.
        // Next.js file-system routes (e.g. /api/stream/product-graph/[...path]) take priority.
        source: "/api/stream/:path*",
        destination: `${railwayUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
