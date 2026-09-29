# Deploy runbook (home hosting, closed pilot) — betamods.com

Production for betamods.com is **self-hosted on a Windows PC** behind a
**Cloudflare Tunnel**. Postgres is **Neon Free**, DNS/registrar/tunnel is
**Cloudflare Free**, and mod archives live in **Cloudflare R2 Standard**.

This is a **deliberately bounded pilot**, not a permanent architecture. The
point is to run the real product for a small invited group at effectively zero
cost, and only then decide whether to move to paid fixed-price hosting. What
"bounded" means, concretely:

| Limit | Default | Enforced by |
|---|---|---|
| Approved uploaders | 5 | `pilot_accounts` allowlist, admin console |
| Single archive | 250 MiB | `uploadBuild` + the ledger |
| Stored per tester | 1.5 GiB | ledger, atomic reservation |
| Stored, everyone | 8 GiB | ledger, atomic reservation |
| Uploads per tester | 10 / hour | ledger, counts failed attempts too |
| New uploads on/off | admin switch | `app_settings` |

The 8 GiB global cap is the important one: R2 Standard includes 10 GB-month
free, so the app cap is what keeps the pilot at **no cost**. It is enforced by
the application from a database ledger, not by Cloudflare alerts. See "Cost
safety".

The Oracle VM target (`compose.oracle.yml`, `deploy/oracle/`, `DEPLOY.md`) is
**kept intact as a fallback**. It is no longer the plan, because Ampere A1
capacity never became available and the tenancy is now locked out by a lost MFA
enrollment. Do not delete those files — see "Oracle fallback" at the end.

Everything in this stack runs in four services. `scripts/home-stack.ps1` is the
supported way to drive them; it always passes `--env-file .env.home`, which the
compose file depends on.

> PowerShell on this PC blocks running `.ps1` files by default. Either allow it
> once per user:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```
>
> or run scripts as `powershell -NoProfile -ExecutionPolicy Bypass -File ...`
> (the scheduled tasks in "Unattended operation" already do this).

## Topology

```text
Internet -> betamods.com (Cloudflare edge)
              |
              | cloudflared dials OUT over TLS; nothing comes IN to this PC
              v
         cloudflared container
              |
              | http://app:3000 over the private Compose network
              v
         Next.js app  ------>  Neon Postgres (pooled connection)
              |  \                 (accounts, mods, builds, the storage ledger)
              |   \
              |    `----->  /app/data  (Docker volume: QUARANTINE SCRATCH ONLY)
              |
              |  <-----  Cloudflare R2  (private bucket: the real archives)
              |            uploads are PUT here after a clean scan;
              |            downloads are a 302 to a presigned GET URL,
              |            so archive bytes never cross this PC
              |
              | http://scan-server:3311  (private network)
              v
         scan-server  ------>  ClamAV (clamd :3310, private network)
```

**No public inbound ports.** No service in `compose.home.yml` publishes a port.
`cloudflared` initiates the outbound connection, so there is nothing to forward
on the router, no UPnP, no inbound firewall rule, and no LAN-reachable listener.
The only way in is the tunnel, and only once you create it.

Uploads remain **quarantine -> scan -> R2 -> serve**, and the sequence is not
shortened for the pilot:

1. The bytes land in the `app-data` volume, which is scratch.
2. ClamAV scans them. Nothing moves on until it returns clean.
3. A clean file is PUT to the private R2 bucket, and the local quarantine copy is
   deleted immediately — success *or* failure. A blocked upload is deleted and
   never reaches R2 at all.
4. The download route 302s to a short-lived presigned R2 GET URL, so the
   archive is served by Cloudflare rather than streamed through the home
   connection. That keeps upload bandwidth as the only thing the tunnel
   carries, and it is why a 250 MiB download is not a problem for a home
   uplink.

If the scanner is down the app refuses to start at all; if it dies later,
uploads return 503 rather than skipping the scan. If the R2 credentials are
missing the whole stack refuses to start (see "Storage"), and if the app cannot
read its storage ledger it refuses uploads rather than allowing uncapped ones.

## Fail-closed startup

Each service waits for the one it depends on:

| Service | Starts when | Meaning of "healthy" |
|---|---|---|
| `clamav` | — | `clamdcheck.sh`: clamd answers PING, signatures loaded |
| `scan-server` | `clamav` is healthy | its `/healthz` PINGs that same clamd and gets PONG |
| `app` | `scan-server` is healthy | HTTP 200 from Next on `:3000` |
| `cloudflared` | `app` is healthy | (tunnel only; see below) |

So a healthy `scan-server` means "a real scan would work right now", not merely
"the HTTP listener is bound" — the wrapper's healthcheck actually talks to
ClamAV. If ClamAV never comes up, the app and the tunnel never start, and the
site is simply not published. `restart: unless-stopped` on every service brings
the stack back after a reboot or a Docker Desktop restart.

`cloudflared` deliberately has **no** healthcheck: its image is
`gcr.io/distroless/base-debian12:nonroot`, which has no shell and no HTTP
prober to run one with. Readiness is observed from outside instead — see
"Cloudflare Tunnel".

## Prerequisites

1. **Docker Desktop with the WSL2 backend.** WSL2 is a prerequisite of the
   backend; install it via `wsl --install` (reboot) if it is not already
   present. Check with `docker version` and `docker info` — both must work.
   Give Docker at least 4 GB of RAM in Settings -> Resources.
2. **Disk space** for images and the ClamAV signature database (~250 MB).
   User files are *not* a reason to need more: the `app-data` volume is
   quarantine scratch, so it only ever holds uploads in flight. Peak local use
   is roughly one 250 MiB archive times the number of simultaneous uploads.
3. **Neon** `main` branch, with its **pooled** connection string to hand.
4. A **direct** (non-pooled) Neon connection string for backups. Keep it
   separate — see "Backups".
5. A **Cloudflare R2** bucket plus a **bucket-scoped** credential — see
   "Storage" below. This is the one piece of setup that has to happen before
   the stack will start.

`Prepare-Host.ps1 -Status` reports all of the above at once.

## First bring-up

```powershell
# 1. Environment. Never commit the real file.
copy .env.home.example .env.home
```

Fill in `.env.home`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon **main** branch, **pooled** connection string. Live only in this PC's `.env.home`. |
| `SESSION_SECRET` | yes | The app refuses to sign sessions with anything else in production. Must stay identical across restarts, or every user is signed out. |
| `SCAN_API_KEY` | yes | `compose.home.yml` refuses to start without it. One value feeds **both** the app and the scan wrapper, so they cannot disagree. |
| `STORAGE_ENDPOINT` | yes | R2 S3 endpoint, `https://<account-id>.r2.cloudflarestorage.com`. |
| `STORAGE_BUCKET` | yes | The bucket holding the archives. |
| `STORAGE_ACCESS_KEY` | yes | **Bucket-scoped** R2 key. See "Storage". |
| `STORAGE_SECRET_KEY` | yes | **Bucket-scoped** R2 secret. |
| `ADMIN_USER_IDS` | yes | Explicit account UUIDs allowed into `/admin`. Email never grants admin access. See `ACCOUNT-SETUP.md`. |
| `APP_URL` | yes | Public HTTPS origin used in verification and password-reset links. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_FROM` | yes | Real mail delivery; local preview files are rejected in production. |
| `SMTP_USER` / `SMTP_PASSWORD` | provider-specific | SMTP credentials, kept in this gitignored environment file. |
| `PILOT_*` | no | Overrides for the limits in the table at the top. Unset means the default, never "unlimited". |
| `ENCRYPTION_KEY` | yes (once Nexus features run) | Base64 of exactly 32 random bytes. Generate once and keep stable. |
| `CLOUDFLARE_TUNNEL_TOKEN` | later | Blank until the tunnel exists. The tunnel profile is off by default. |
| `NEXUS_SSO_*` | no | Blank until the app is registered with Nexus. |

Generate the secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"    # SESSION_SECRET / SCAN_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # ENCRYPTION_KEY
```

The R2 credential is created in the Cloudflare dashboard, not generated —
"Storage" below.

```powershell
# 2. Verify everything on loopback — no tunnel, no DNS, nothing published.
.\scripts\home-stack.ps1 verify
```

`verify` is the gate that runs before anything public happens. It validates
both compose files, builds the images, starts the stack with the loopback-only
overlay, waits for `clamav` -> `scan-server` -> `app` to all report healthy,
then runs the full smoke check (containers, app HTTP 200, Neon connectivity,
and the real scan chain: benign bytes accepted, EICAR flagged). ClamAV's first
boot downloads its signature database, so expect several minutes.

`verify` uses the **real** `.env.home`, R2 included. The overlay only adds
loopback port bindings; it does not swap the storage driver, because verifying
the plumbing with a different storage backend than production proves nothing
about presigned downloads, quarantine cleanup, or the quota ledger. If you want
to try the plumbing before the real bucket is ready, use a throwaway bucket and
its own bucket-scoped credential, then put the real values back before the
tunnel exists.

Once that passes:

```powershell
# Optional: prove the real upload pipeline (needs an account that owns a mod).
.\scripts\home-stack.ps1 smoke -Full -OwnerEmail owner@betamods.com
```

Then create the tunnel (next section) and point DNS at it.

### Confirming nothing is exposed

With the **production** compose file only (no verification overlay):

```powershell
.\scripts\home-stack.ps1 status
```

- The `PORTS` column must be empty for every service.
- `netstat -ano | findstr ":3000"` on the host returns nothing.
- Windows Firewall has no new inbound rules, and the router has no port
  forwarding added. Nothing needed either.

## Storage (Cloudflare R2)

Mod archives live in R2 Standard, not on this PC.

**Create the bucket.** Cloudflare dashboard -> **R2** -> **Create bucket**,
e.g. `betamods-storage`. Leave the default location and the default
class (Standard). Do **not** add a custom domain: archives are served by
presigned URL, which needs no public hostname, and a public custom domain would
need public access on the bucket — the opposite of what is wanted.

**Create a bucket-scoped credential.** R2 -> **Manage R2 API Tokens** ->
**Create Account API Token**. Permissions: **Object Read & Write** for
**Specified bucket**, that one bucket only. It returns an Access Key ID and a
Secret Access Key. Put those in `.env.home` as `STORAGE_ACCESS_KEY` and
`STORAGE_SECRET_KEY`, plus the endpoint and bucket name.

> **The account-wide token must never be used at runtime.** The token in
> `.env.local` that `scripts/setup-r2.mjs` uses is a *setup* credential: it can
> create buckets and mint other tokens across the whole account. Only the
> bucket-scoped key belongs in `.env.home` or in a running container. This is
> why `compose.home.yml` requires exactly the four `STORAGE_*` values and
> hard-sets `STORAGE_DRIVER=r2`: a missing or mistyped credential stops the
> stack dead rather than quietly falling back to local disk, so no one can
> accidentally run the production stack with everyone's mods on a laptop.

Confirm the credential works, from the repo root, before bringing the stack up:

```powershell
node scripts/r2-inventory.mjs
```

That lists the bucket, prints the object and byte totals, and cross-checks the
contents against the database. It reports two kinds of drift worth knowing
about: **orphaned** objects (in the bucket, no build row — wasted spend, often
a delete that did not finish) and **missing** objects (a build row with no
file, which will 404 on download). It merges credentials from `.env.local` and
`.env.home` (`.env.home` wins — the value that describes the real bucket), or
point it at a single file with `--env-file <file>`.

### Why the bucket is not mirrored

There is no second copy. A backup bucket would double storage cost, which is
precisely what the 8 GiB cap exists to avoid — a mirror of 8 GB is another
8 GB-month of charge, and 16 GB is past the 10 GB-month free allowance.

The accepted trade, stated plainly: **R2 has no object versioning, and the
bucket is the only copy of every archive.** If the bucket is lost, the database
is intact but the archives are gone, and mod authors have to re-upload. What
the backup script gives you instead of a copy is a *record* — a dated
inventory you can diff against the live bucket to find out exactly what is
missing, which is the difference between "something broke" and "these nine
archives are gone". See "Backups".

## Cost safety

The mandatory control is the **application cap**, not Cloudflare alerts.

| Layer | What it does | What it is not |
|---|---|---|
| `PILOT_MAX_TOTAL_BYTES` (8 GiB) | The app refuses a reservation that would exceed the cap, atomically, so concurrent uploads cannot race past it. | It does not shrink if you raise it, and it is not a hard limit on what Cloudflare will accept. |
| `PILOT_MAX_BYTES_PER_TESTER` (1.5 GiB) | One tester cannot use the whole budget. | — |
| `PILOT_MAX_ARCHIVE_BYTES` (250 MiB) | Bounds any single upload. | — |
| Allowlist (5 accounts) | Bounds who can spend it at all. | — |
| Admin kill switch | Turns off all new uploads immediately, without a deploy. | It does not delete anything. |
| Cloudflare billing alerts | Email you when a bill is generated. | **Not a limit.** They arrive after the fact and cannot stop an upload. |

Cloudflare does not offer a hard storage cap on R2, and the free allowance is
10 GB-month. So the 8 GiB application cap, enforced in the database with
`pg_advisory_xact_lock` reservations, is what actually keeps the pilot free.
Set a billing alert anyway as a tripwire for the things the cap does not
cover (Class A/B request charges), but never treat it as the control.

If the cap starts rejecting legitimate uploads, the fix is to raise it
deliberately in `.env.home` after checking what is actually stored:

```powershell
node scripts/r2-inventory.mjs
```

then delete something, or accept the cost knowingly. Do not simply delete the
limit.

### Quotas are enforced fail-closed

`reserveStorage` cannot prove how much is in use, it fails: no reservation, no
upload, 503. A storage outage must not turn into an uncapped one. The same is
true of a missing R2 credential at startup. The trade is that a database or
bucket outage takes uploads down; that is the intended behaviour.

## Running the pilot

`/admin` is the console, reachable only to `ADMIN_USER_IDS`. It shows:

- **Usage** — bytes reserved in flight, bytes stored, and both caps, from the
  same ledger the upload path uses. If reserved is nonzero and not moving,
  something is stuck; see the "stale reservation" note in Troubleshooting.
- **Upload switch** — turns all new uploads on or off, immediately.
- **Allowlist** — approve or revoke an account by email, up to
  `PILOT_MAX_UPLOADERS`.

Onboarding a tester is: sign up normally, then approve them in `/admin`. With
`PILOT_MODE=on` (the home default) an unapproved account can browse, sign in,
comment, and download, but the upload form is not offered and the server
refuses the POST — the check is server-side, not just a hidden control.

To bring a tester in for a real build, verify the whole path yourself first:

```powershell
node scripts/r2-inventory.mjs
```

An upload that succeeds should appear in the bucket with no local copy left
behind, and `/admin` should show the stored bytes rising by roughly the
archive's size.

## Cloudflare Tunnel

**Not created yet, on purpose.** The stack is verified on loopback first so a
misconfiguration cannot be published. Do this only after `verify` passes.

1. Cloudflare dashboard -> **Zero Trust** -> **Networks** -> **Tunnels** ->
   Create a tunnel (`cloudflared`) named e.g. `betamods-home`.
2. Add a **Public hostname**:
   - Subdomain `betamods` (and `www` if you want it), domain `betamods.com`
   - Service: `http://app:3000`
     (`app` is the Compose service name — the tunnel and the app share a
     private network, so there is no port to publish and no `localhost` to
     reach.)
3. In the connector install instructions, choose **Docker**, and copy the
   token out of the `docker run ...` command. Put it in `.env.home` as
   `CLOUDFLARE_TUNNEL_TOKEN=`.
4. Start it:

```powershell
.\scripts\home-stack.ps1 tunnel-up
.\scripts\home-stack.ps1 logs -Service cloudflared
```

The tunnel is ready when the log shows **`Registered tunnel connection`**. Until
that line appears the hostname will not serve.

`cloudflared` runs under the `tunnel` compose profile, so plain
`home-stack.ps1 up` never publishes anything. That profile is enabled only by
`tunnel-up` (or by adding `--profile tunnel` yourself), which is what keeps the
"unverified stack" from being reachable by accident. Enabling the profile with
a blank token fails loudly and crash-loops rather than serving a broken site.

To stop publishing without stopping the app: `.\scripts\home-stack.ps1 tunnel-down`.

Once a tunnel serves a hostname, Cloudflare issues and renews the TLS
certificate automatically. There is no Let's Encrypt step and no certificate
file to manage — the Caddy service from the Oracle stack has no role here.

## DNS

Also deliberately untouched so far. After the tunnel is running and serving:

1. Cloudflare DNS: set `betamods.com` and `www` to
   **CNAME `<tunnel-id>.cfargotunnel.com`**, **Proxied** (orange cloud).
2. Leave the existing `A`/`AAAA` records for those names removed — a stale
   `A` record pointing at the Oracle IP will keep serving the old (dead)
   target in preference to the tunnel.
3. Verify with `curl.exe -sI https://betamods.com`, then
   `SMOKE_BASE_URL=https://betamods.com .\scripts\home-stack.ps1 smoke`.

## Unattended operation (reboot / Docker Desktop startup)

```powershell
.\deploy\home\windows\Prepare-Host.ps1 -AutoStart -PreventSleep -DailyBackup
```

Use `-WhatIf` first to see every change. `-Status` reports the current state;
`-Remove` undoes it.

What it does:

- **Docker Desktop starts at sign-in** (the same effect as Docker Desktop's
  own "Start Docker Desktop when you sign in" toggle, set in the registry).
- **A logon task** (`betamods-home-stack`) runs `home-stack.ps1 up` two minutes
  after sign-in. Containers would return on their own thanks to
  `restart: unless-stopped`; this also covers a stack previously taken down
  with `down`.
- **Sleep and lid-close are disabled on AC power** (see below).
- **A daily 04:00 backup task** (`betamods-home-backup`), allowed to run on
  battery and to catch up after a missed start.

### The one Windows limitation worth knowing

Docker Desktop is a **desktop application, not a Windows service**. It cannot
start before anyone signs in, so:

- The PC must be **signed in** after a reboot. A **locked screen is fine** —
  the session stays alive and the site keeps serving.
- If the PC reboots to a login prompt and nobody signs in, nothing comes up.
  Set up Windows auto-login, or accept that the site is down until someone logs
  in. There is no configuration that removes this; it is a property of Windows
  and of Docker Desktop.

## Sleep and power requirements

A sleeping or hibernating PC is an **offline site**: the tunnel drops, and
`betamods.com` returns Cloudflare's error until the machine wakes. Prevent it:

```powershell
.\deploy\home\windows\Prepare-Host.ps1 -PreventSleep
```

which sets, on **AC power only**:

- `powercfg /change standby-timeout-ac 0` — never sleep
- `powercfg /change hibernate-timeout-ac 0` — never hibernate
- `powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0` — closing
  the lid does nothing (no-op on a desktop), then `powercfg /setactive` to apply

Confirm with `powercfg /requests` (lists what currently requests or prevents
sleep) and `.\deploy\home\windows\Prepare-Host.ps1 -Status`.

Caveats:

- **On battery the settings are untouched, on purpose** — an unplugged laptop
  should be allowed to sleep. The trade-off is that the site is offline while
  it is on battery and idle. Keep the PC on AC if betamods.com must stay up.
- Modern Standby laptops can behave differently from the classic setting above.
  If sleep is still happening on AC, check that the *active power plan* has
  sleep disabled (Windows sometimes applies a vendor "HP Recommended" plan that
  differs from the balanced one), and check for a vendor utility re-applying
  its own power policy.
- Hibernate is a separate risk from sleep and is disabled too — a hibernating
  machine holds the tunnel down for a longer, less predictable stretch.

## Backups

Two artefacts, because they cover different kinds of loss. Run both with:

```powershell
.\scripts\home-stack.ps1 backup
```

Destination defaults to `C:\betamods-backups`, override with `-BackupDir` or
`$env:BETAMODS_BACKUP_DIR`.

**Keep backups off OneDrive and out of this repo.** A bind mount out of a
OneDrive-synced folder is slow, can fail on file locking, and has no reason to
sync a large tarball; the script refuses a path under `\OneDrive\`.

### 1. The R2 inventory (a record, not a copy)

`r2-inventory-<date>.json`, written by `scripts/r2-inventory.mjs`. Every object
in the bucket with its key and size, cross-checked against the database rows
that claim those objects exist.

This is deliberately **not** a copy of the archives — see "Why the bucket is
not mirrored". What it buys:

- After any incident, an exact answer to "which archives exist", instead of an
  inventory of a bucket you cannot see.
- A diff against a later run. `restore -Which audit` lists the bucket now and
  prints what is **missing** since a given inventory, what was added, and what
  changed size.
- Detection of the two silent failures: **orphaned** objects in the bucket that
  no build row points at (money being spent on nothing) and **missing** objects
  that a build row does point at (a download that will 404). Both are reported
  as failures, because both need a human.

The JSON is parsed after writing — a file that exists but is not valid JSON is
not a record.

### 2. Neon Postgres (the `main` branch)

`neon-<date>.dump`, taken with the **direct (non-pooled)** connection string.
This matters: `pg_dump` over the pooled pgbouncer endpoint produces a dump that
can restore into an empty database, silently. The script explicitly rejects a
URL containing `-pooler.` rather than writing a plausible-looking bad backup.

The dump is verified with `pg_restore --list` immediately after it is written.

To set the URL, either export it for the run, or create a `.backup.env` beside
this repo (gitignored — add it if it is not already):

```
NEON_DIRECT_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/betamods?sslmode=require
```

The URL is passed to the container through the environment, never on the
command line, so it does not land in the shell's command history.

**`pg_dump` version coupling.** The dump is taken by the `postgres:18-alpine`
image, and `pg_dump` refuses to run against a *newer* server ("server version:
180006; pg_dump version: 170005"). Neon is on PostgreSQL 18, so that matches —
but if Neon upgrades, every scheduled backup will start failing until
`$PostgresImage` in `scripts/home-backup.ps1` and `scripts/home-restore.ps1` is
bumped. The script preflights the client/server pair on every run and fails
with a message naming the tag to use, rather than writing nothing quietly.

Backups are pruned to `$Keep` days (default 14).

### What is deliberately *not* backed up

The `app-data` volume. It is quarantine scratch: every upload passes through it
and is deleted once the file is in R2, so it holds no user archives. Archiving
it would protect nothing while preserving unscanned user uploads — including
anything ClamAV flagged — in a second place, which is exactly the copy you do
not want.

If you need a forensic record of what was in flight when something went wrong:

```powershell
.\scripts\home-backup.ps1 -IncludeQuarantine
```

Handle that tarball as untrusted input. It is not part of the routine schedule.

### Restoring

```powershell
# Audit only: read-only, needs no stack, safe any time.
.\scripts\home-stack.ps1 restore -Which audit -Stamp 2026-09-28

# Always a dry run first; it prints exactly what it would overwrite.
.\scripts\home-stack.ps1 restore -Which neon -Stamp 2026-09-28

# Then commit to it.
.\scripts\home-stack.ps1 restore -Which neon -Stamp 2026-09-28 -Confirm
```

`-Which neon` is the only restore that brings data back: the database. It
stops the stack first so nothing writes mid-restore, and restarts it after.

**A restore does not bring back archives.** They were never in the backup (see
"Why the bucket is not mirrored"). After a Neon restore, use `-Which audit`
against a recent inventory to find out which archives are still actually there.

`-Which app-data` restores quarantine scratch and is only meaningful for a
backup taken with `-IncludeQuarantine`.

**Do a restore drill once, while nothing is wrong.** A backup procedure that has
never been executed is an assumption. Restore into a scratch Neon branch or
accept a brief outage deliberately — not during an incident.

### What is *not* covered

- **The archives themselves.** Stated above: one copy, in R2, no versioning. If
  it is lost, mod authors re-upload. This is the accepted cost of staying
  inside the free allowance.
- **This PC.** If the machine's disk dies, the stack is gone — but so is
  nothing that matters, because the archives are in R2 and the database is in
  Neon. Copy `C:\betamods-backups` off-machine anyway, so the inventory history
  and database dumps survive the PC.
- **Neon branch history.** Neon Free retains point-in-time restore and branch
  copies, which is the fastest recovery path for the database ("Restore to a
  branch", then repoint). The dumps above are the belt-and-braces copy that
  does not depend on the Neon console.

## Day-to-day

| Task | Command |
|---|---|
| Start / resume | `.\scripts\home-stack.ps1 up` |
| Start after a code change | `.\scripts\home-stack.ps1 up -Build` |
| What is running | `.\scripts\home-stack.ps1 status` |
| Logs | `.\scripts\home-stack.ps1 logs -Service app` |
| Restart | `.\scripts\home-stack.ps1 restart` |
| Health check | `.\scripts\home-stack.ps1 smoke` |
| Stop (keeps the volume) | `.\scripts\home-stack.ps1 down` |
| Publish / unpublish | `.\scripts\home-stack.ps1 tunnel-up` / `tunnel-down` |
| Back up | `.\scripts\home-stack.ps1 backup` |
| Restore | `.\scripts\home-stack.ps1 restore` (dry run), then `-Confirm` |
| Check the bucket | `node scripts/r2-inventory.mjs` |
| Check for lost archives | `.\scripts\home-stack.ps1 restore -Which audit` |
| Approve a tester / stop uploads | the `/admin` page |

Deploying a code change is a pull plus `up -Build`. The `clamav-db` volume keeps
the signature database, so only the very first boot is slow.

## Troubleshooting

**Site returns Cloudflare's error, and `betamods.com` is unreachable**
The tunnel is down or was never started. `.\scripts\home-stack.ps1 status`, then
`logs -Service cloudflared`. If the machine was asleep or signed out, that is
the cause (see "Sleep and power requirements" and the Windows limitation above).

**`docker compose` complains about `SCAN_API_KEY` or a `STORAGE_*` variable**
It was invoked without `--env-file .env.home`, or the value is missing/blank
from it. Use `home-stack.ps1` rather than calling `docker compose` directly.
For `STORAGE_*`, see "Storage" — a blank there is *meant* to stop the stack,
not fall back to local disk.

**Uploads fail with a 503 and no obvious error**
The app is failing closed, which is what it is supposed to do. The likely
causes, in order: the R2 credential is wrong or the bucket does not exist
(`node scripts/r2-inventory.mjs` will say so directly); or the app cannot reach
Neon, so it cannot establish usage and refuses to reserve. Check `logs -Service
app` for the specific reason — the messages distinguish "storage unavailable"
from "quota exceeded".

**"Storage quota exceeded" on an upload you expected to be fine**
Someone else is holding the budget: check `/admin` for the reserved-in-flight
number and run `node scripts/r2-inventory.mjs` for what is actually stored. A
non-zero *reserved* figure that is not moving means a reservation was stranded
by a crash mid-upload; the ledger reclaims stale ones automatically, so if it
persists, restart the app. If *stored* is genuinely near 8 GiB, the fix is to
delete something, not to raise the cap.

**A download 404s but the build page exists**
The build row points at an object that is not in the bucket. `node
scripts/r2-inventory.mjs` reports these as `MISSING`; `home-backup.ps1` fails
on them for the same reason. Either the object was deleted, or it is a row
left over from when the app ran on local storage. Re-uploading is the fix.

**An object is in the bucket that nothing links to**
`orphaned` in the inventory. Usually a mod was deleted and the object cleanup
did not finish, or a build row was removed out of band. It is costing money,
which is why `home-backup.ps1` reports it as a failure. Delete it with the
`aws` CLI or the R2 dashboard.

**App is not starting / uploads fail with a scanner error**
The chain is fail-closed, so this is ClamAV or the wrapper. `logs -Service
clamav scan-server`. On a first boot, ClamAV is downloading signatures and is
`starting` for several minutes — that is the `start_period: 6m` in
`compose.home.yml`. If ClamAV is wedged, deleting the `clamav-db` volume forces
a clean re-download (costs a slow first boot, loses nothing).

**ClamAV health check fails with a database error**
Delete the `clamav-db` volume and let it re-download.

**Everything works, but `verify` says the scan chain failed**
Check that the verification overlay is in play (it is what publishes the
scanner on loopback): `.\scripts\home-stack.ps1 config` validates both files.

**Docker engine not responding**
Docker Desktop is not running, or the WSL2 backend has not finished starting.
`docker info` is the authority. Note that Compose commands silently do nothing
useful while the engine is stopped.

## Oracle fallback

The Oracle target is preserved, not maintained, and is the escape hatch if
home hosting stops working:

- `compose.oracle.yml`, `deploy/oracle/Caddyfile`,
  `deploy/oracle/install-docker.sh`, and `DEPLOY.md` are unchanged.
- `scripts/smoke-prod.mjs` is target-agnostic; it takes the compose file,
  service list, and scan endpoint as parameters, so the same script checks
  either stack.
- The two targets have separate Compose project names (`betamods` vs
  `betamods-home`) and separate env files (`.env.production` vs `.env.home`), so
  they can coexist and neither can clobber the other's volumes.
- They share the same Neon `main` branch, so only **one** should ever be pointed
  at it at a time.
- Two differences to remember if you ever switch back: Oracle runs the scan
  wrapper *inside* the app container (`SCAN_ENDPOINT=http://127.0.0.1:3311`),
  and it uses Caddy for TLS rather than a tunnel.

## Free-tier boundaries

- **R2 Standard** includes 10 GB-month of storage, plus Class A and Class B
  operations. The 8 GiB application cap covers the storage side. Operations
  are the residual risk: every upload is a PUT, every download a GET, and the
  presigned-URL approach means those operations hit R2 directly rather than
  consuming the tunnel. Listing (the inventory script) is a Class B operation
  and is free, which is another reason the inventory — not a mirror — is the
  right backup.
- **Neon Free** throttles compute and auto-suspends when idle; the first request
  after a lull is slower, never billed. Keep one production branch plus a `dev`
  branch — see `DEPLOY.md` section 5. Do **not** point the dev branch at the
  production `DATABASE_URL`; `scripts/apply-migrations.mjs` refuses to run if
  you try.
- **Cloudflare Free** covers DNS and Tunnels on a free plan. Tunnels are not
  usage-billed.
- **This PC** is the runtime: no per-request or per-GB charge, just electricity.
  The trade is availability (sleep, reboots, signed-out sessions) rather than
  cost, which is why the power and auto-start sections above matter. Disk space
  is not the trade, because the archives are in R2.
- Do not add a paid runtime to escape a limit. If a limit is hit, delete
  something or raise a cap deliberately; if RAM is short, raise Docker's
  allocation.

## Moving off the pilot

The pilot exists to answer one question: does this product work when real people
use it? If the answer is yes and the usage grows past what the caps allow, the
migration is a hosting change, not a rewrite:

- The storage driver is behind one interface (`lib/storage.ts`). A different
  object store means a new driver in the same shape as `lib/storage-r2.ts` and
  a different `STORAGE_DRIVER` value — the upload pipeline, the scan gate, the
  quota ledger, and the download route do not change.
- The quota ledger is not pilot-specific. The caps are configuration, so
  raising them is an env change. The ledger's job is to make concurrent
  reservations correct, which is worth keeping at any scale.
- The `deploy/oracle/` files are the archived fallback for "this PC is not
  workable", already written and untouched.

What does **not** carry over unchanged is the R2-bucket-is-the-only-copy
decision. At real scale, with real users' files, that becomes worth fixing —
either by enabling object versioning on the bucket or by mirroring. The reason
it is not done now is purely that a second copy does not fit inside 10 GB-month.
