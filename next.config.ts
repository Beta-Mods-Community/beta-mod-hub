import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // lib/definitions.ts accepts files up to 250 MiB. Next.js otherwise
      // rejects Server Action bodies above 1 MiB before uploadBuild can run;
      // leave room here for multipart boundaries and the other form fields.
      bodySizeLimit: "251mb",
    },
  },
};

export default nextConfig;
