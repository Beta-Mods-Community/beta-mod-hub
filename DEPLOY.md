# Optional Oracle deployment

This retained Linux/Compose configuration is not the live Beta Mods service.
The current hosted profile is in [Cloud operations](DEPLOY-CLOUD.md). These
instructions are a starting point for an independently reviewed deployment,
not a claim that Oracle capacity, pricing, or the complete stack is verified.

Do not create resources, change the official domain, or connect this target to
the live database as part of contributor setup.

## Topology

```text
Caddy :80/:443 -> app :3000 -> PostgreSQL
                          -> persistent app-data volume
                          -> scan wrapper :3311 -> ClamAV :3310
```

The app waits for healthy ClamAV; Caddy waits for the app. Only Caddy's ports
are published. Both quarantine and final scanned files use the persistent
`betamods_app-data` volume. Scanner failure rejects uploads.

The home profile has a different Compose project name and volume set, but
neither target should share a writable database with another deployment.

## Host preparation

The supplied install script targets Oracle Linux 9. The original sizing target
was an Ampere A1 VM with 1 OCPU, 4 GiB RAM, and a 50 GB boot volume. Recheck shape
availability, free-tier eligibility, image compatibility, disk, memory, and
network limits in the provider console before provisioning. Do not assume an
old runbook guarantees no charges.

Save an SSH private key securely and supply only its public key to the VM.
Restrict SSH ingress to trusted sources; HTTP/HTTPS need their intended public
ports. Keep database and scanner ports private.

Review, then run the install script on the intended host:

```bash
bash deploy/oracle/install-docker.sh
```

It installs Docker and Compose and configures a 4 GiB swapfile. Swap can help a
build complete but is not a substitute for measuring runtime memory use.

## Configuration

Copy `.env.production.example` to ignored `.env.production` on the host.
Required deployment settings include:

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated database, pooled connection for Neon |
| `SESSION_SECRET` | Stable random session signing key |
| `APP_URL` | This deployment's HTTPS origin |
| `ADMIN_USER_IDS` | Deliberately selected verified account UUIDs |
| Mail settings | Real verification/reset delivery; see [Account setup](ACCOUNT-SETUP.md) |
| `SCAN_API_KEY`, `MALWARE_SCAN_API_KEY` | Matching wrapper/app keys when scan authentication is configured |
| `ENCRYPTION_KEY` | Stable base64-encoded 32-byte key before credential-storage features run |

Compose selects local final storage and the internal scan endpoints. Keep
`CLOUD_PILOT` off and Nexus SSO unconfigured. Do not copy R2 bootstrap tokens,
home tunnel credentials, or development secrets to this target.

The supplied Caddyfile names the official domain. For another instance, review
and replace it with a hostname you control before startup. Do not request
certificates for or repoint `betamods.com` without owner approval.

## Build and verify

```bash
sudo docker compose -f compose.oracle.yml config --quiet
sudo docker compose -f compose.oracle.yml up -d --build
sudo docker compose -f compose.oracle.yml ps
sudo docker compose -f compose.oracle.yml logs --tail=100 app clamav caddy
```

ClamAV's first signature download can take several minutes. Check the app
from inside its container; port 3000 is not published on the host:

```bash
sudo docker compose -f compose.oracle.yml exec -T app \
  wget -qO- http://127.0.0.1:3000/api/health
```

Review logs without publishing secrets. A healthy container is not proof of
email, upload, or backup behavior.

`scripts/smoke-prod.mjs` is an operator tool for this profile. It reads
`.env.production`, checks containers/database/app, and sends scanner probes.
Its defaults assume loopback access to app/scanner ports that this Compose
file does not publish. Adapt the check's access path before using it; do not
open those ports publicly to satisfy a test.

The optional `--full` path also creates temporary builds/files under an
existing owner account and attempts cleanup. Use an isolated test listing and
explicitly selected environment. It is not read-only. Record any blocked
fixture or incomplete cleanup; never disable endpoint protection to run it.

## HTTPS cutover

After local checks pass, configure the intended hostname to reach the VM,
allow ports 80/443, and verify Caddy's certificate and HTTPS routes. Update
`APP_URL` to that same canonical origin. Check real account verification and
recovery messages, authorized downloads, and private-file denial.

Changing the live service requires a separate migration plan covering database
isolation, stored bytes, credentials, DNS, rollback, and user sessions. A working
alternative stack is not permission to replace the official site.

## Backups and restore

The persistent volume survives container rebuilds, not VM deletion. Back up
both the database and final files as one recoverable dataset. Pause writes or
use another reviewed consistency method while capturing them.

- Use a PostgreSQL dump client compatible with the server version.
- Use a direct database connection for dumps and keep its credentials out of
  command history and Git.
- Encrypt backups, retain recovery keys separately, and keep verified copies
  outside the VM's failure boundary.
- Rehearse restoration into an empty disposable database and volume before
  relying on a backup. Check file hashes and application behavior.
- Confirm exact restore targets before destructive operations. Do not restore
  over the live database or volume during a rehearsal.
- Review actual disk, object storage, egress, and retention costs. Local backup
  copies consume the same volume allowance as the running service.

Never prune all Docker volumes as routine cleanup. Avoid automatic broad
deletion commands; select and verify expired backup targets explicitly.

This profile does not use the official cloud pilot's backup credentials,
operations jobs, or storage bucket. See [Deployment profiles](docs/DEPLOYMENT.md)
for the supported separation between targets.
