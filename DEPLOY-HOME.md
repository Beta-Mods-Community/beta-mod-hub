# Optional home deployment

This is a retained Windows/Docker configuration, not the live Beta Mods site.
The current hosted service is described in [Cloud operations](DEPLOY-CLOUD.md).
For ordinary source work, use [Contributing](CONTRIBUTING.md); for the native
Windows launcher, use [Local preview](LOCAL-PREVIEW.md).

This profile depends on the host PC remaining online. It stores final files in
R2 but still uses local disk, memory, and upload bandwidth. It is not a way to
host without a PC dependency, and its application quotas do not guarantee
zero provider charges.

## Topology

```text
Cloudflare Tunnel -> app -> Neon PostgreSQL
                         -> private R2 bucket (final files)
                         -> local quarantine volume
                         -> scan-server -> ClamAV
```

`compose.home.yml` publishes no host ports. The optional `tunnel` profile
starts `cloudflared`, which reaches `app:3000` on the Compose network.
`compose.home.localtest.yml` adds loopback-only ports for verification.

Startup waits for ClamAV, the scan wrapper, and the app to become healthy in
that order. The wrapper's healthcheck PINGs ClamAV. Later scanner failures reject
uploads; they never permit unscanned publication. Tunnel availability still
needs an external check.

Final files go to the private R2 bucket after a clean scan. Quarantine is
temporary local storage. Downloads use short-lived signed URLs after application
authorization. Do not expose the bucket publicly.

## Prerequisites

- Windows with a working Docker Desktop/WSL2 installation. Both `docker version`
  and `docker info` must succeed.
- Enough memory and disk for the app build, ClamAV signatures, images, and
  simultaneous quarantined uploads. Measure the intended workload.
- A separate PostgreSQL database for this deployment and a direct connection
  for backups. Do not share a writable database with another running target.
- A private R2 bucket and a bucket-scoped object read/write credential.
- A verified mail sender and an HTTPS origin before inviting users.

Check host prerequisites with:

```powershell
.\deploy\home\windows\Prepare-Host.ps1 -Status
```

## Configuration

Copy `.env.home.example` to ignored `.env.home`. The script always passes
`--env-file .env.home` to Compose so interpolation and container variables
use the same configuration. Never publish `docker compose config` output
because it can include secrets.

Required settings:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated database, pooled connection for Neon |
| `SESSION_SECRET` | Stable random session signing key |
| `SCAN_API_KEY` | Shared by the app and wrapper through Compose |
| Four `STORAGE_*` values | R2 endpoint, bucket, bucket-scoped access key, and secret |
| `APP_URL` | Your own intended HTTPS origin |
| `ADMIN_USER_IDS` | Explicit account UUIDs |
| Mail settings | Real verification/recovery delivery; see [Account setup](ACCOUNT-SETUP.md) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Needed only when publishing through the tunnel |

Keep `CLOUD_PILOT` off for this profile. Compose fixes `STORAGE_DRIVER=r2`
and wires the scanner; missing required credentials stop startup. A broad
account/bootstrap token must never reach the running services. Keep Nexus
settings empty until that integration is validated.

### Default pilot limits

| Limit | Default |
| --- | --- |
| Approved uploaders | 5 |
| Build archive | 250 MiB |
| Stored per account | 1.5 GiB |
| Total stored/reserved | 8 GiB |
| Upload attempts | 10 per account/hour |

These differ from the stricter cloud profile. Atomic database reservations
enforce quotas; they cannot cap unrelated bucket use or provider request fees.
Billing alerts are notifications, not spending limits. Review current R2 terms
and actual account usage before changing limits. Do not promise a free deployment
based on the byte cap alone.

## Verify before publishing

```powershell
.\scripts\home-stack.ps1 verify
```

This command rebuilds/restarts the stack with the loopback overlay, waits for
healthy services, and probes the scan chain. It uses the real configured database
and bucket, so first use an isolated test environment. ClamAV's first signature
download can take several minutes.

For an approved test account that already owns a test listing:

```powershell
.\scripts\home-stack.ps1 smoke -Full -OwnerEmail owner@example.com
```

The full check writes temporary builds/files and attempts cleanup. Do not run
it during user uploads or assume cleanup cannot fail. It is not a read-only
production check. If endpoint protection blocks a scan fixture, stop and record
the limitation rather than disabling protection.

Inspect inventory with an explicit environment selection:

```powershell
node scripts/r2-inventory.mjs --env-file .env.home
```

Investigate missing or unreferenced objects before making changes. Held
reservations do not expire automatically; an old reservation can still represent
real bytes. Do not clear the ledger to recover capacity without reconciliation.

## Publish only after review

Create a Cloudflare Tunnel for a hostname you control, pointing its HTTP service
to `http://app:3000`. Store only its connector token in `.env.home`, then:

```powershell
.\scripts\home-stack.ps1 tunnel-up
.\scripts\home-stack.ps1 logs -Service cloudflared
```

Confirm a registered connection and external HTTPS behavior. Configure the
hostname's DNS for that tunnel according to Cloudflare's current instructions.
Do not overwrite the official site's Render records or unrelated mail records.

Plain `up` does not enable the tunnel profile. To stop public access while
leaving the internal stack running:

```powershell
.\scripts\home-stack.ps1 tunnel-down
```

## Routine operation

```powershell
.\scripts\home-stack.ps1 status
.\scripts\home-stack.ps1 logs -Service app
.\scripts\home-stack.ps1 up
.\scripts\home-stack.ps1 down
```

`down` preserves named volumes; do not add volume-deletion flags casually.
Use `/admin` to pause uploads and manage uploader approval. Approval is for
file uploads, not ordinary download, vote, or text-report participation.

Optional unattended setup:

```powershell
.\deploy\home\windows\Prepare-Host.ps1 -AutoStart -PreventSleep -DailyBackup -WhatIf
```

Review the proposed changes before repeating without `-WhatIf`. The helper
configures startup at Windows sign-in, AC power sleep behavior, and a backup
task. It does not guarantee availability across sign-out, shutdown, battery
sleep, network loss, or failed Docker startup.

## Backups

`scripts/home-backup.ps1` creates a database dump and an R2 inventory record.
It does **not** copy final object bytes. If the bucket is lost, a database
restore cannot recover archives; authors need their original files.

Use a private backup location outside the repository and synced folders, and
supply the direct database connection through protected configuration. The
script uses PostgreSQL 18 client tools and checks the server version. Review
compatibility and retention before scheduling it.

```powershell
.\scripts\home-backup.ps1 -BackupDir C:\betamods-backups
.\scripts\home-restore.ps1 -BackupDir C:\betamods-backups -Which audit
```

The audit compares inventory without restoring. Other restore modes default to
a dry run; `-Confirm` makes destructive changes. Rehearse against a separate
empty database/volume first, verify exact targets, and pause the app before a
real restore. Quarantine backup is opt-in and can contain untrusted files.

A database dump plus inventory is not a complete file backup. A deployment
requiring file recovery needs a separately reviewed object-backup plan and
its storage/egress budget. None of these scripts should target the live cloud
pilot, which uses different storage and its own isolated backup process.

## Alternative target

[Oracle deployment](DEPLOY.md) uses a different Compose project and environment
file. Separate volumes do not make a shared database safe. Review a migration
plan before changing targets; do not run both against one live database.
