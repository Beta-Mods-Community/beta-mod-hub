import type { NextConfig } from "next";
import { isCloudPilot } from "./lib/pilot";

const nextConfig: NextConfig = {
  // Isolated local validation avoids locked OneDrive/dev cache entries.
  // Containers and ordinary start/build commands keep the default .next path.
  distDir: process.env.BETAMODS_BUILD_CHECK === "1" ? ".next-check" : ".next",
  headers() {
    return [{
      source: "/:path*",
      headers: [
        // The application has no embedded-page workflow. Keep these independent
        // of script/style policy so Next's hydration and form handling are unchanged.
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    }];
  },
  ...(isCloudPilot() ? { cacheMaxMemorySize: 0, images: { unoptimized: true } } : {}),
  experimental: {
    serverActions: {
      // The small cloud pilot is 8 MiB/file + 1 MiB form overhead. Its native
      // launcher also rejects oversized/concurrent bodies before React parses.
      // Other targets: MAX_UPLOAD_BYTES in lib/definitions.ts is 512 MiB.
      // Next.js otherwise rejects Server Action bodies above 1 MiB before
      // uploadBuild can run, so the limit must clear the app's hard ceiling
      // plus multipart boundaries and the other form fields. The *effective*
      // archive cap is the smaller PILOT_MAX_ARCHIVE_BYTES (default 250 MiB in
      // lib/pilot.ts); if an operator raises that cap, it must stay below this
      // body limit or the request is silently refused before the action runs.
      bodySizeLimit: isCloudPilot() ? "9mb" : "513mb",
    },
  },
};

export default nextConfig;
