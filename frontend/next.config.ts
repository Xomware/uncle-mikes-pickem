import type { NextConfig } from "next";

import { assertBuildEnv } from "./lib/env";

assertBuildEnv(process.env);

const nextConfig: NextConfig = {
  // Static export to S3 + CloudFront. All group data comes from the authed API at runtime.
  output: "export",
  // Emits /groups/index.html so CloudFront's directory-index behaviour can serve /groups/.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
