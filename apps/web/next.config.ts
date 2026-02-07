import type { NextConfig } from "next";
import { resolve } from "path";
import { config } from "dotenv";

// Load environment variables from monorepo root
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@slop-detector/db", "@slop-detector/shared"],
};

export default nextConfig;
