# App service image (Next.js + scan-server HTTP wrapper).
#
# This image serves both deployment targets; only the compose file differs.
#
#   service: app (this Dockerfile)
#     SCAN_ENDPOINT=http://localhost:3311
#     CLAMD_HOST=clamav                    (Compose private networking)
#     CLAMD_PORT=3310
#   service: clamav  ->  deploy/clamav/Dockerfile (clamd, port 3310)
#
# Oracle fallback (compose.oracle.yml) runs the scan wrapper INSIDE this
# container via the CMD below, so SCAN_ENDPOINT is loopback.
#
# Home hosting (compose.home.yml) runs the wrapper as its own service
# (deploy/home/scan-server/Dockerfile) so it can be health-gated, and overrides
# `command:` to start Next alone with SCAN_ENDPOINT=http://scan-server:3311.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/public ./public

# Start the scan wrapper (background) + the Next server (main process).
# Used by the Oracle fallback target. The home stack overrides `command:` and
# starts Next only, because its scan wrapper is a separate service.
# Healthcheck hits the Next server, so scan-server failing won't unhealthily
# flap the app — uploads surface a 503 from the scan service instead.
CMD ["sh", "-c", "node scripts/scan-server.mjs & exec npm run start -- -p ${PORT:-3000}"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:${PORT:-3000}/ > /dev/null || exit 1
