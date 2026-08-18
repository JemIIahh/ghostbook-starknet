import type { NextConfig } from "next";
import path from "path";

const fccProxy =
  process.env.FCC_PROXY_URL || "http://127.0.0.1:6674";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/fcc/:path*",
        destination: `${fccProxy.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
