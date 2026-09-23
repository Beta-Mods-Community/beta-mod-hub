# ClamAV sidecar with limits matching the app's 512 MiB upload cap.
# The Debian image is multi-architecture, so it runs on Oracle Ampere ARM as
# well as ordinary x86-64 hosts.

FROM clamav/clamav-debian:stable

COPY clamd.conf /etc/clamav/clamd.conf
