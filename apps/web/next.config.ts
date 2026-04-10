import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vendorstream/database", "@vendorstream/contracts"],
};

export default nextConfig;
