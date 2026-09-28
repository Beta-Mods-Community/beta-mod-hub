# Standalone malware-scan wrapper, run as its own service (home stack).
#
# The build context is the REPOSITORY ROOT, not this directory, so the one
# canonical scripts/scan-server.mjs gets copied in rather than duplicated. A
# second copy living here would silently drift from the script the dev host
# runs and from the request contract in lib/scan.ts.
#
#   service: scan-server (home stack)
#     CLAMD_HOST=clamav  CLAMD_PORT=3310  SCAN_SERVER_PORT=3311  SCAN_API_KEY=*
#
# compose.home.yml points the app at http://scan-server:3311 and gates the app
# on this container's healthcheck, which PINGs clamd — so the app only starts
# when a real upload scan would actually succeed. Uploads stay
# quarantine -> scan -> serve.

FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    SCAN_SERVER_PORT=3311

COPY scripts/scan-server.mjs ./scan-server.mjs

# The wrapper only binds a high port and talks to clamd over the network, so it
# never needs root. Running unprivileged means a bug here cannot touch the
# volume or the image.
USER node

EXPOSE 3311

# "The listener is bound" is not the same as "a scan would work". /healthz
# PINGs clamd, so healthy here genuinely means the scan chain is usable.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:${SCAN_SERVER_PORT:-3311}/healthz > /dev/null || exit 1

CMD ["node", "scan-server.mjs"]
