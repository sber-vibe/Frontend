import path from "node:path";
import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  sassOptions: {
    loadPaths: [path.join(process.cwd(), "src/styles")],
  },
  async rewrites() {
    // Браузер ходит только на свой origin, Next проксирует запросы в backend — CORS не нужен.
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
