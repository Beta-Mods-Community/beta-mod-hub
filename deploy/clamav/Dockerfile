# ClamAV sidecar for Railway — clamd with limits matching the app's 512 MiB
# upload cap. On Railway, create this as a second service in the same project
# (Docker from this folder), expose port 3310, enable private networking.
# The app service reaches it at clamav.railway.internal:3310.

FROM clamav/clamav:stable

COPY clamd.conf /etc/clamav/clamd.conf