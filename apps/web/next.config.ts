import type { NextConfig } from "next";
import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables from monorepo root
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@slop-detector/db", "@slop-detector/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "yt4.ggpht.com",
      },
    ],
  },
};

export default nextConfig;
