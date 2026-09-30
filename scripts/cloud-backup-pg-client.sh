#!/usr/bin/env bash
set -euo pipefail
# Invoked via a pg_dump or pg_restore symlink. No secret is put in argv.
client="$(basename "$0")"
case "$client" in
  pg_dump|pg_restore) ;;
  *) echo 'Unsupported backup PostgreSQL client.' >&2; exit 1 ;;
esac
exec docker exec -i \
  -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD -e PGSSLMODE -e PGOPTIONS \
  -e PGCONNECT_TIMEOUT -e PGAPPNAME \
  betamods-backup-rehearsal "$client" "$@"
