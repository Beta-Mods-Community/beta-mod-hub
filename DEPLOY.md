# Deploy runbook (Oracle fallback) — betamods.com

> **This is the fallback target, not the plan.** Oracle deployment was abandoned:
> Ampere A1 capacity never became available, and the tenancy is now locked out
> by a lost MFA enrollment. These files are kept intact so the option stays
> open — do not delete them.
>
> Production now runs on the home-hosting stack: **this Windows PC behind a
> Cloudflare Tunnel**. See **`DEPLOY-HOME.md`** and `compose.home.yml`.
>
> The two targets use separate Compose project names (`betamods` vs
> `betamods-home`) and separate env files (`.env.production` vs `.env.home`),
> so their volumes never collide — but they share one Neon `main` branch, so
> only point one of them at it at a time.

Production uses hard free-tier resources: **Oracle Cloud Always Free** for the
web app and scanner, **Neon Free** for Postgres, and **Cloudflare Free** for
DNS. No paid Railway service or usage-billed R2 storage is required.

## Topology

```text
Internet -> betamods.com -> Caddy (:80/:443)
                               -> Next.js app (:3000)
                                    -> scan wrapper (:3311, same container)
                                         -> ClamAV (:3310, private network)
                                    -> Neon Postgres
                                    -> /app/data (persistent Docker volume)
```

Uploads remain **quarantine -> scan -> serve**. Both quarantine and clean files
live on the persistent `app-data` volume; nothing is promoted until ClamAV
returns clean. If the scanner is unavailable, the app refuses to start first,
and uploads return 503 if the scanner dies mid-run.

## 1. Oracle Always Free VM

- Home region: US Midwest (Chicago)
- Name: `betamods-prod`
- Shape: `VM.Standard.A1.Flex` marked **Always Free-eligible**
- Size: 1 OCPU / 4 GB RAM
- Boot volume: default 50 GB (within the Always Free block-volume allowance)
- Public subnet and public IPv4 address
- Existing `id_ed25519_betamods.pub` public key
- Ingress: TCP 22, 80, and 443 only

Do not click **Upgrade**. A Free Tier tenancy cannot turn traffic growth into a
compute bill; it reaches resource limits instead.

## 2. Deploy the app on the VM

### 2.1 Install Docker

Copy the repository to the VM, then run:

```bash
bash deploy/oracle/install-docker.sh
```

The script installs Docker Engine and the Compose plugin from Docker's CentOS
repository (compatible with Oracle Linux 9 on Ampere ARM), plus a 4 GiB
swapfile to safely soak the Next.js production build on a 4 GB RAM VM.

### 2.2 Production environment

Create `.env.production` on the VM from `.env.production.example` (both are
gitignored; only the example is in the repo). Every variable is listed there;
the full required set is:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Neon **main** branch, **pooled** connection string (the app talks to pgbouncer). Live only in the VM's `.env.production`. Never print or commit it. |
| `SESSION_SECRET` | yes | Long random value. The app refuses to sign sessions with anything else in production. |
| `ENCRYPTION_KEY` | yes (once Nexus features run) | Base64 of exactly 32 random bytes; AES-256-GCM key for each user's encrypted Nexus credential (`nexus_links`). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `NEXUS_SSO_*` | no | Left blank until the app is registered with Nexus; unset = SSO disabled, email+password remains the login path. `NEXUS_SSO_REDIRECT_URI` is `https://betamods.com/nexus-sso/callback`. |
| `SCAN_API_KEY` / `MALWARE_SCAN_API_KEY` | no | Optional shared secret between the app and the in-container scan wrapper. If you set one, set **both to the same value** — a mismatch turns every scan into a 401 and breaks uploads. Leave both blank and the scan wrapper enforces nothing. |

`compose.oracle.yml` fixes the safe production values itself
(`STORAGE_DRIVER=local`, `SCAN_ENDPOINT=http://127.0.0.1:3311`,
`CLAMD_HOST=clamav`, `CLAMD_PORT=3310`, `PORT=3000`) — do not put those in
`.env.production`.

Do not copy `CLOUDFLARE_API_TOKEN`, R2 credentials, development Nexus keys, or
the local database backup URL to the VM.

### 2.3 Validate and start

```bash
# Compose must validate before anything is launched.
sudo docker compose -f compose.oracle.yml config > /dev/null

sudo docker compose -f compose.oracle.yml up -d --build
sudo docker compose -f compose.oracle.yml ps
sudo docker compose -f compose.oracle.yml logs --tail=100 app clamav caddy
```

Startup order is fail-closed: the app waits for ClamAV to be **healthy**
(clamd answering, signatures loaded — first boot downloads them and can take
several minutes), and Caddy waits for the app to be healthy before Caddy
listens. If ClamAV never becomes healthy, the app never starts; it will not
silently serve uploads unscanned.

Verify the app locally on the VM before changing DNS:

```bash
curl --fail http://127.0.0.1:3000/
```

## 3. Smoke check

`scripts/smoke-prod.mjs` (run on the VM, from the repo directory) verifies the
production stack end-to-end. It reads `.env.production` directly and **never
prints it or its secrets** — DB checks print only the host, and nothing is
seeded into production.

```bash
# Read-only checks (safe to run at any time):
node scripts/smoke-prod.mjs

# Full pipeline check — only after the owner has created their first Beta Mod:
SMOKE_OWNER_EMAIL=owner@betamods.com node scripts/smoke-prod.mjs --full
```

The read-only run verifies:

1. Containers — `app`, `clamav`, `caddy` all running; `app` and `clamav`
   healthy.
2. App readiness — HTTP 200 on the app. Pre-DNS it probes
   `http://127.0.0.1:3000`; after pointing DNS, run with
   `SMOKE_BASE_URL=https://betamods.com` to also check the public HTTPS/TLS
   path through Caddy (Set this env var in the same invocation).
3. Database connectivity — `SELECT version()` against Neon; prints only the
   masked host.
4. Scan chain — POSTs benign bytes to the scan endpoint and requires a clean
   verdict; POSTs the EICAR test signature and requires it to be flagged.
   This exercises ClamAV through the scan wrapper exactly as uploads do.

With `--full`, the script additionally drives the **real upload pipeline**
through the public HTTP form (no browser automation): it signs in as
`SMOKE_OWNER_EMAIL` with a session minted from the host's `SESSION_SECRET`,
uploads a generated benign zip to an existing mod owned by that account,
verifies the served bytes match what was stored, then uploads EICAR and
verifies it is rejected. Both artifacts are cleaned up afterwards (the builds
row is deleted and the file removed from the volume), so the check alters
production only transiently and by necessity. If no mod exists for that owner,
the full loop is skipped with a note rather than creating production data.

## 4. DNS and TLS

After the smoke check passes:

1. Cloudflare DNS: `A @ -> <Oracle public IPv4>`, DNS-only initially.
2. Add `CNAME www -> @`, DNS-only initially.
3. Allow TCP 80 and 443 in the Oracle VCN security list and host firewall.
4. Caddy obtains Let's Encrypt certificates automatically.
5. Verify `https://betamods.com` (`SMOKE_BASE_URL=https://betamods.com node
   scripts/smoke-prod.mjs`), then optionally enable Cloudflare proxying with
   SSL/TLS mode **Full (strict)**.

## 5. Neon: one project, two branches

Production and local development share one Neon project but must never point at
the same branch after launch.

**Creating the `dev` branch is a dashboard step** (Neon console -> project ->
Branches -> Create branch) — the agent does not have that account access and
must not change the database arrangement for it. Leave it for the repo owner
or Codex.

- `main` branch = **production**. Its pooled connection string lives only in
  the VM's `.env.production`. Never print or commit it.
- `dev` branch = **local development**. Before launch: create the `dev`
  branch, copy its **pooled** connection string into the local `.env.local`,
  and remove any demo/test rows from `main`. After that, never let the local
  `.env.local` point at the `main` branch again.

The smoke script runs against the **production** environment only when
executed on the VM (its `.env.production`); never run it with a local
`.env.local` pointed at `main`.

## 6. Backups

### 6.1 Persistent app-data volume (`betamods_app-data`)

The Docker volume survives container rebuilds but not accidental VM/volume
deletion. It holds quarantined and clean uploaded files, so back it up with the
database. From the repo directory (the compose project is `betamods`, hence the
`betamods_app-data` volume name):

```bash
# Backup (weekly, or before any destructive maintenance):
mkdir -p backups
sudo docker run --rm \
  -v betamods_app-data:/data -v "$PWD/backups:/backup" \
  alpine sh -c 'tar czf /backup/app-data-$(date +%F).tgz -C /data .'

# Restore (app must be stopped first):
sudo docker compose -f compose.oracle.yml stop app
sudo docker run --rm \
  -v betamods_app-data:/data -v "$PWD/backups:/backup" \
  alpine sh -c 'tar xzf /backup/app-data-YYYY-MM-DD.tgz -C /data'
sudo docker compose -f compose.oracle.yml start app
```

### 6.2 Neon Postgres (production `main` branch)

Install the client tools on the VM once: `sudo dnf -y install postgresql`.

Use the **direct (non-pooled)** Neon connection string for `pg_dump` — the
pooled URL is for the app and can break streaming backups. Do not put the URL
on the command line where shell history can capture it; export it from a
mode-600 file or use `PGPASSWORD`:

```bash
# Backup (daily; run as a cron job later):
set -a && source .snapshot_env && set +a        # .snapshot_env: mode 600, Neon main DIRECT URL only
pg_dump --no-owner --no-privileges --format=custom \
  -f "$PWD/backups/betamods-$(date +%F).dump" "$NEON_DIRECT_URL"

# Restore (replaces the target database contents):
pg_restore --clean --if-exists --no-owner \
  -d "$NEON_POOLED_URL" "$PWD/backups/betamods-YYYY-MM-DD.dump"
```

Verify a backup file is non-empty/restorable after creating it — a broken
backup is no backup.

### 6.3 Staying within Always Free limits

- Oracle Always Free includes one Ampere VM and **200 GB total block storage**.
  The boot volume is 50 GB, so keep `backups/` and any snapshots inside the
  remaining ~150 GB. The dataset is tiny; retention of 7 daily DB dumps plus
  one weekly volume tarball is plenty (prune with `find backups/ -name '*.dump'
  -mtime +7 -delete` and the equivalent for `*.tgz`).
- Neon Free throttles compute hours and branch count rather than billing. One
  production branch, a `dev` branch, and a small daily dump stays far inside
  the free envelope. Neon free computes auto-suspend after inactivity — the
  first request after a lull is slightly slower, never billed.
- Cloudflare Free: DNS + basic proxying, no charge.
- The Oracle VM stops or thrashes at its memory limit instead of scaling up —
  swap + `vm.swappiness=10` keep it usable during builds. Never add a paid
  shape to escape a limit; trim retention or traffic first.

## 7. Cleanup after launch

- Leave the old Railway project in place until this deployment passes the full
  smoke check (`--full`); delete it afterward to avoid confusion.
- Revoke the R2 bootstrap token and any temporary keys once storage setup is
  confirmed unused on the free stack.