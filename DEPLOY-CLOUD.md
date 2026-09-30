# Cloud pilot operations

The current site is [betamods.com](https://betamods.com), a gated beta for a
small invited testing group. It runs entirely on hosted services. The Windows
preview and optional Compose targets are not production dependencies.

The source is public; accounts, uploads, credentials, and backups are private.
Only the owner merges and deploys. Automatic deploys and pull-request previews
are disabled. Contributor changes must not migrate the live database, change
DNS, or run provider tests without operator review.

## Services

| Service | Role | Configuration |
| --- | --- | --- |
| Render | Web application | Free native Node 22 service, no persistent disk or sidecar |
| Neon | PostgreSQL | Isolated pilot branch, separate from development |
| Supabase | Final scanned files | Dedicated project and private S3-compatible bucket |
| Transloadit | Managed scanning | Community workspace, server-side credentials |
| Resend | Verification and recovery mail | Free HTTPS API, verified sender |
| Cloudflare | Registrar and DNS | DNS-only website CNAMEs, separate mail verification records |

Free plans can sleep, throttle, suspend, or stop accepting work. They are not
an uptime guarantee. Keep paid upgrades disabled and check provider dashboards
before changing resource limits. Application quotas are not provider billing
caps.

Provider references: [Render Free](https://render.com/docs/free),
[Supabase cost control](https://supabase.com/docs/guides/platform/cost-control),
[Transloadit pricing](https://transloadit.com/pricing/), and
[Resend pricing](https://resend.com/pricing). Recheck current terms before
changing the deployment; do not infer available quota from this document.

## Configuration

Use `.env.cloud.example` for the complete variable list and
[Deployment profiles](docs/DEPLOYMENT.md) for a configuration overview. Values
belong in Render's private environment settings. An optional local preparation
copy is `.env.cloud.local`, which is ignored. The launcher does not load it
automatically. Do not copy a home or local environment wholesale.

Required modes are literal `CLOUD_PILOT=on`, `PILOT_MODE=on`,
`STORAGE_DRIVER=s3`, `SCAN_DRIVER=transloadit`, `AUTH_MAIL_MODE=resend`, and
`NODE_ENV=production`. Set `CLOUD_PILOT=on` during both build and runtime.

- Identify the isolated database before any schema write. Use its pooled
  connection with `sslmode=require`. Development migration helpers are not
  production deployment steps.
- Keep the object bucket private and set an 8 MiB bucket file limit. Supabase
  S3 keys bypass RLS across their project, so use a dedicated project and
  server-only credentials. See [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).
- Match `TRANSLOADIT_SIGNATURE_ALGORITHM` to the actual credential; do not
  assume the default. Inform uploaders that files are sent to a scanning service.
- Use a sending-only Resend credential and a verified `AUTH_MAIL_FROM`.
  Verify and recovery links use `APP_URL`.
- Generate independent stable session and pilot secrets, plus a base64-encoded
  32-byte `ENCRYPTION_KEY`. Store recovery copies securely.
- Set `ADMIN_USER_IDS` only after identifying verified accounts in this
  database. An email address does not grant administrator access.
- Remove local mail-preview settings, `AUTH_ALLOW_UNVERIFIED_LOCAL`, local
  scanner settings, bootstrap tokens, and tunnel tokens.
- Leave Nexus SSO unconfigured until its provider integration is validated.

### Render settings

| Setting | Value |
| --- | --- |
| Runtime | Native Node 22 |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `MALLOC_ARENA_MAX=2 npm run start:cloud` |
| Application origin | `APP_URL=https://betamods.com` |
| Health path | `/api/health` |
| Port | Render-supplied `PORT`, otherwise launcher default 10000 |
| Deployment | Manual, reviewed revision; previews off |

The launcher requires the cloud build's 9 MiB form limit and sets a 256 MiB
JavaScript heap ceiling. Native libraries and buffers use additional memory.
Do not replace `start:cloud` with `next start`, Compose, or the Windows
launcher.

On Linux, `MALLOC_ARENA_MAX=2` must be set before Node starts. The startup
guard checks that setting; it does not prove the process fits the host's
memory limit. Keep it in the host environment or start command, not a file
loaded after startup.

### Domain

Both the apex and `www` use DNS-only CNAMEs to the existing Render service.
Render redirects `www` to the apex. Keep website records separate from
Resend's sender-verification records.

Do not override `APP_URL` with `RENDER_EXTERNAL_URL`. Cookies are host-only,
so an origin change requires users to re-enter the pilot code and sign in;
it does not require new accounts. Preserve stable secrets during the change.

## Access and limits

The site-wide `PILOT_ACCESS_KEY` must contain at least 32 random characters.
It issues a signed 24-hour gate cookie. Rotation invalidates existing gate
cookies. Share it only with the invited group, never in public source,
screenshots, or public support requests.

The gate does not replace email verification, login, listing visibility,
administrator checks, or private-attachment permissions. Upload approval is
separate: ordinary testers can download accessible builds, vote, and submit
text reports without occupying an uploader slot.

| Cloud limit | Maximum |
| --- | --- |
| Uploaded file | 8 MiB |
| ZIP entries | 256 |
| ZIP member | 8 MiB |
| ZIP expanded total | 32 MiB |
| Image decoded size | 4,194,304 pixels |
| Total final/reserved storage | 100 MiB |
| Per-account storage ceiling | 128 MiB, still subject to the lower total cap |
| Approved uploaders | 5, including the owner |
| Upload attempts per account | 5 per hour |
| Release-package input | 32 MiB including conservative entry overhead |
| Release-package source metadata | 1 MiB |
| Incoming request body | 9 MiB |
| Concurrent mutations/exports | 1 |

Configuration can tighten cloud limits, not raise them. The cloud ZIP policy
rejects nested, encrypted, ZIP64, malformed, unsafe-path, and unsupported
container content. Some otherwise valid mod packages are deliberately outside
this profile. Attachments are strict ZIP or validated plain UTF-8
text/log/JSON/INI; binary game saves are not supported here.

Images require scans of both the original and canonical output. Every scan
uses a server-generated ZIP envelope; publication requires an explicit
successful result and the exact envelope SHA256. Missing results, unexpected
warnings, errors, timeouts, and quota failures reject the upload.

Quarantine is private ephemeral scratch, not a durable job queue. Only scanned
files reach the private bucket. Download routes check permissions before
issuing short-lived signed URLs.

### Scan allowance

`TRANSLOADIT_MONTHLY_BUDGET_MIB` defaults to 3072 and cannot exceed the code
ceiling. The UTC-calendar-month counter uses `auth_rate_limits` under
`cloud-scan:month`. Each provider request reserves:

```text
3 * ceil((file bytes + 1024) / 1048576) estimated MiB
```

A tiny scan consumes 3 estimated MiB; an exact 8 MiB input consumes 27. Images
require two scans. Failed and timed-out calls are not refunded because the
provider may have processed them.

This is conservative application accounting, not the provider's bill. It
excludes separate dashboard/probe jobs and may reset on a different schedule.
Confirm the provider plan's own stop-at-limit behavior. Do not clear the counter,
add payment details, or weaken scanning to bypass quota exhaustion.

## Health and memory

`/api/health` checks database access and configuration. It does not spend a
scan request and does not prove storage, scanning, or email delivery works.

`scripts/cloud-memory.mjs` logs numeric startup/job memory summaries, including
RSS, heap, external/array-buffer use, and Linux cgroup counters when available.
Sampling runs at 500 ms intervals for at most five minutes. Lifetime peaks
and sampled peaks are different measures; short spikes can be missed. Missing
counters are reported as null.

Use these records with restart logs and representative uploads. Do not treat
a configured heap limit, health response, or one successful upload as proof
of memory safety under every input.

## Backups and recovery

The official service's nightly backups run on hosted runners in a separate
private, owner-only operations repository. This app repository must not receive
backup credentials or privileged backup workflows. The legacy home/R2 and
Oracle scripts are not cloud-pilot backup tools.

Backups include a consistent database dump, referenced object bytes, and
ledger/object reconciliation. Archives are encrypted with AES-256-GCM before
upload. Verification downloads the archive, authenticates it, checks hashes,
and restores into an empty disposable database.

The configured retention keeps a new verified snapshot and the previous
verified copy. A temporary third copy is allowed within a 450 MiB artifact
ceiling; encrypted payloads stop at 149 MiB. Retention is at most 90 days, so
copies can expire if jobs stop. Unexpected artifacts or drift must fail a job
rather than trigger broad deletion.

The backup database role is read-only. The separate S3 key is not read-only:
it has project-wide access and must remain restricted to operations. Keep
decryption keys and independent runtime secrets in a recovery store. Snapshots
do not contain deployment configuration.

Full backups consume storage-provider egress and artifact storage. Review
combined account usage and free-plan limits. Restore only to an explicitly
selected empty target, verify schema and files, then smoke-test before any
runtime URL changes. Never use an automated restore test against the live DB.

## Interrupted uploads

Held reservations do not expire automatically. The legacy
`PILOT_RESERVATION_TTL_MINUTES` setting no longer releases capacity. A remote
PUT can succeed before a restart prevents its result from being recorded.
Releasing that charge on age alone would undercount stored bytes.

If held or unlinked objects remain, pause uploads and reconcile the bucket,
file references, and ledger. Release a charge only after the storage outcome
is known and any approved cleanup is complete. A timed-out PUT can finish
after an immediate DELETE, so that DELETE alone does not settle the outcome.

Cloud S3 calls have a 30-second overall deadline, including response streams
and inventory traversal, a five-second connection timeout, and one SDK attempt.
Uncertain writes/deletes retain their charge. No automatic cloud repair is
configured. Drift alerts are not permission to delete user data or raise caps.

## Validation scope

Contributor CI tests isolated application behavior and builds, not the hosted
services. Keep deployment revisions, provider diagnostics, and test-account
details in private operator records rather than contributor documentation.

Hosted validation remains incomplete for malware rejection, some archive/body
boundaries, provider-failure handling, exact export boundaries, and restart
recovery during scanning. Offline passes do not establish hosted behavior.
An unresolved provider-path image rejection also needs investigation before
claiming complete image-boundary coverage.

Check sign-in, verification, and password-recovery links after an origin change.
Record which hosted checks actually ran for each release. Do not disable
security controls to complete a test, or seed and delete hosted data as part
of ordinary contributor checks.
