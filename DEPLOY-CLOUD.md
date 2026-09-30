# Cloud pilot operations

Updated September 30, 2026. The current service is a gated, cloud-only beta for
approximately 15 invited Discord group members. Their ability to test the site
is separate from the five approved file-uploader slots. There is no PC hosting
dependency, automatic paid upgrade, or approval for a general public launch.

Use the existing Render service and isolated pilot database. Keep the local
preview, older deployment configurations, scanning, permissions and resource
caps unchanged. Share the pilot URL and access code privately with invitees;
never place the code in a public channel, source control or screenshots.

Application source remains in one repository. Hosted backups are operated in
the separate owner-only operations repository described below. The old backup
secrets and retained runs have been removed from the app repository. Invite
contributors by their confirmed GitHub usernames with Read access only.

## Selected target

| Service | Role | Required choice |
| --- | --- | --- |
| Render | Native Node 22 web service | Free instance, no payment method, no disk or sidecar |
| Neon | Application database | Separate isolated pilot branch on Free; keep existing dev and production unchanged |
| Supabase | Final scanned files | Dedicated Free project, one private S3-compatible bucket |
| Transloadit | Managed ClamAV processing | Existing Community workspace; no card or paid plan |
| Resend | Verification/reset email | Free transactional HTTPS API, verified sender domain |

Cloudflare remains the registrar/DNS provider. Do not create a home tunnel or
point the website domain at anything during setup. First validate using the
host-provided HTTPS URL behind the private pilot gate.

Render Free sleeps after 15 idle minutes, can restart, and has ephemeral disk;
cold starts can take about a minute. It blocks SMTP ports, so this target uses
HTTPS email. With no payment method, exhausted bandwidth suspends free services
and exhausted build minutes block new builds. External-traffic limits can also
suspend a service. This is a limited pilot, not an uptime commitment.
[Render Free restrictions](https://render.com/docs/free).

Supabase Free includes 1 GB storage and is not charged for exceeding Free
limits; service restrictions can apply. The app's 100 MiB ceiling leaves space,
but does not account for unrelated objects or guarantee unlimited downloads.
Keep the project dedicated, inspect usage, and do not upgrade the organization.
[Storage usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size),
[cost control](https://supabase.com/docs/guides/platform/cost-control).

Transloadit Community stops processing when its recurring 5 GB allowance is
used; it has no overage. This is processing usage, not 5 GB of uploaded mods.
[Community pricing](https://transloadit.com/pricing/).

Resend Free allows 100 transactional emails/day and 3,000/month. Keep paid
subscriptions and transactional overages disabled; never automatically upgrade
to recover from quota exhaustion. [Resend pricing](https://resend.com/pricing).

## What the code currently bounds

- Build uploads: standard ZIP only, at most 8 MiB compressed, 256 entries,
  8 MiB per member and 32 MiB expanded total. Strict structural and CRC checks
  reject malformed, encrypted, ZIP64, nested archives, packed game containers,
  unsafe/conflicting paths, special files, opaque extras and trailing payloads.
  This intentionally refuses some valid complex mod packages; it is not a
  general-purpose replacement for the earlier 250 MiB upload target.
- Images: at most 8 MiB and 4,194,304 decoded pixels. Both the original image and
  canonical image require their own clean scan; a successful decode is not a
  malware verdict. Cloud feedback attachments are strict ZIP or validated plain
  UTF-8 text/log/JSON/INI, at most 8 MiB; binary saves are deferred. Existing
  reporter/author-only attachment permissions still apply.
- Every scan uses a deterministic server-created ZIP envelope around the exact
  bytes, avoiding Community image transformation. Publication requires the
  expected scanner result and matching full SHA256 of that envelope. Errors,
  timeouts, quota failures, missing results and unknown warnings fail closed.
- Final files live only in the private object bucket after scanning. Downloads
  use short-lived authenticated S3 GET signatures; no public bucket URL or
  anonymous write policy is required. Quarantine is private ephemeral scratch,
  removed on completion, not a durable background-job queue.
- Storage ledger: 128 MiB/account ceiling, 100 MiB total, five approved uploaders and
  five upload attempts per account per hour. Config may tighten, not raise,
  these cloud ceilings. Old stored bytes remain charged independently of the
  recent attempt window. Failed-cleanup objects keep their storage charge.
- Promotion exports: 32 MiB cumulative input including actual build/media
  bytes, generated text and conservative entry overhead; 1 MiB source metadata
  limit. Individual materialized storage reads are bounded too.
- `scripts/cloud-server.mjs` rejects oversized or unbounded request bodies
  before Next parses them: 9 MiB request ceiling and required Content-Length
  for mutations. It admits one mutation/export at a time without queuing bodies.
  Sharp concurrency is one with its cache disabled. These are controls, **not
  proof that the actual 512 MB host has passed memory or load testing**.

The private pilot access code (`PILOT_ACCESS_KEY`, at least 32 random characters)
issues a signed 24-hour gate cookie. It is separate from normal account login,
email verification, owner permissions, administrator UUIDs and uploader
approval. It grants none of those roles. Rotate it to invalidate gate cookies.
Share the URL/code only with the approximately 15 invited Discord group members
through private messages or a genuinely private invitation, not a public channel.
Never commit or publish the access code. Static assets and the minimal health
endpoint are not secrets.

File-upload approval is separate from joining the beta. The five approved
uploader slots include the owner (so at most four additional accounts can hold
approval while the owner retains it). Builds, screenshots and report attachments
require approval; downloading accessible builds, voting and text-only reports
do not. Ordinary login/verification, mod visibility and author/reporter access
rules still apply. Do not grant administrator rights or raise the uploader cap
just to let a tester participate.

### App scan budget is an estimate

`TRANSLOADIT_MONTHLY_BUDGET_MIB` defaults to 3072 and cannot raise the code ceiling.
The durable UTC-calendar-month counter is in `auth_rate_limits` under
`cloud-scan:month`. Before each provider request it charges:

```text
3 × ceil((file bytes + 1024) / 1048576) estimated MiB
```

This rounds each scan to at least one MiB before the 3x allowance: a tiny file
charges 3 estimated MiB and an exact 8 MiB input charges 27. Images have two scan
stages. Failures/timeouts are not refunded because upstream work may have
occurred. This conservative accounting is **not proof of actual provider
billing**, does not include separate probes/dashboard jobs and may reset on a
different schedule from the provider. The unchanged Community hard stop remains
the final no-overage boundary. Do not clear the counter to evade a limit.

## Configuration and account gates

Use `.env.cloud.example` as the key-name reference. Real values belong in the
host's secret environment settings, never Git, screenshots or chat. A private
local preparation copy must be called `.env.cloud.local` (already gitignored),
not `.env.cloud`. The launcher does not load either file automatically. Do not
reuse `.env.home` wholesale or repoint the local preview.

1. Complete Render login and explicitly approve its GitHub App for
   the single application repository only. Review this installation again if
   the repository is transferred; do not grant unrelated-repository access.
   Select native **Node**, not the repository's existing Dockerfile. Pin Node
   22 using Render's `NODE_VERSION` setting.
   [Node version configuration](https://render.com/docs/node-version).
2. Create/identify the dedicated Supabase Free project and private bucket
   `betamods-pilot`. Confirm public access is off, and do not add anonymous
   read/write policies. Set an 8 MiB bucket file ceiling as defense in depth.
   Copy its S3 endpoint, region and server credentials privately. Supabase's
   generated S3 keys bypass RLS and cover **all project buckets**, which is why
   this project must be dedicated and these keys must never reach a browser.
   [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication).
3. Prepare an isolated Neon pilot branch. Verify its project, branch and host
   before any write; do not infer isolation merely from a valid Neon hostname.
   Set its pooled `DATABASE_URL` with `sslmode=require`. Verify tables against
   `schema.sql` and reviewed migrations using that isolated branch only.
   Existing migration helpers intentionally target dev and must not be repointed
   to production or silently substituted into the deployment build command.
4. Complete Resend Free setup and verify a sender domain/subdomain through its
   specific DNS verification records. This email-verification DNS work is a
   separate approval gate, not permission to repoint `betamods.com`'s website.
   Set `AUTH_MAIL_MODE=resend`, `RESEND_API_KEY`, and `AUTH_MAIL_FROM` from that
   verified sender. The Free account and approved email-only DNS records are
   ready, the sender is verified and a scoped sending key is prepared. The
   owner's real signup-verification and password-reset inbox round trips have
   passed for the current pilot.
5. Add the existing Transloadit key/secret with the matching
   `TRANSLOADIT_SIGNATURE_ALGORITHM`. The evaluated named key uses `sha256`;
   do not assume the `sha384` default for a different key. Keep Community/no
   card, and disclose temporary third-party scanning to testers before uploads.
6. Generate independent stable session/pilot secrets and a base64 32-byte
   `ENCRYPTION_KEY`; save safely. Set actual admin account UUIDs only after
   identifying the account on this pilot DB. Keep Nexus SSO unconfigured until
   real registration details are verified.

Exact required mode values are `CLOUD_PILOT=on`, `PILOT_MODE=on`,
`STORAGE_DRIVER=s3`, `SCAN_DRIVER=transloadit`, `AUTH_MAIL_MODE=resend`, and
`NODE_ENV=production`. Use literal `on`, not `true` or `1`. Remove
`AUTH_ALLOW_UNVERIFIED_LOCAL`, preview mail settings, local scanner settings,
R2 bootstrap keys and tunnel tokens. `APP_URL` is the exact eventual HTTPS origin.

## Render service settings, after account/configuration approval

| Setting | Value |
| --- | --- |
| Runtime | Native Node 22 |
| Instance | Free; no payment method, no persistent disk |
| Repository | `Beta-Mods-Community/beta-mod-hub`, reviewed deployment revision |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `MALLOC_ARENA_MAX=2 APP_URL="$RENDER_EXTERNAL_URL" npm run start:cloud` |
| Health path | `/api/health` |
| Port | Render-supplied `PORT`; launcher default 10000 |

Render sets `RENDER_EXTERNAL_URL` to the service's assigned HTTPS origin. The
start command passes that value into `APP_URL` before loading the application;
this avoids guessing a hostname during first creation. If a custom domain is
later approved, set its exact `APP_URL` and use `MALLOC_ARENA_MAX=2 npm run start:cloud`.
[Render default environment variables](https://render.com/docs/environment-variables).

The allocator setting above is deployed with the startup guard. It is **not a general memory-safety
guarantee**. Preserve the Render start command when deploying that guard.
On the Linux cloud target the launcher refuses to start unless
`MALLOC_ARENA_MAX=2` is already present. Export it through the start command or
host environment **before Node starts**, never through application JavaScript
or a later-loaded `.env` file. The check validates configuration, not glibc's
internal allocator state. Limiting allocator arenas may reduce retained native
memory at a concurrency/performance cost; it is not a memory limit or proof
that every possible upload fits 512 MiB. Three successive maximum-pixel hosted
uploads passed; exact export boundaries and interrupted uploads remain separate
unverified follow-ups.
The package command remains cross-platform; local preview, Oracle, build
commands, image quality and upload/pixel caps are unchanged. The synthetic
runtime rehearsal passes the value in the spawned child's initial environment.

`CLOUD_PILOT=on` must be present during **both build and runtime**. The launcher
checks the built manifest for the 9mb form limit and refuses a mismatched build.
`start:cloud` sets a 256 MiB JS heap ceiling; buffers/native libraries also use
memory, so this is not a 256 MiB total-process cap. Do not replace this command
with `next start`, Docker Compose or the Windows preview launcher.

Render Free hides CPU/memory charts behind a paid compute upgrade. Do not
upgrade for this check. `scripts/cloud-memory.mjs` emits private numeric-only
startup and exclusive-job summaries: process RSS/heap/external/array-buffer
usage, fixed-path Linux cgroup current/peak/limit where available, and bounded
500 ms samples (at most 600 samples, five minutes). Process/kernel peaks are
lifetime high-water marks; sampled peaks can miss short spikes. No request
identifiers or secrets are logged, and there is no public metrics endpoint.
Use these records plus restart/failure checks for the hosted memory gate;
unavailable counters are reported as null, never invented.
Health checks query the database and validate configuration. They do not spend
a scan request and **do not prove scanner, storage or email availability**.

## Encrypted off-PC backups

Hosted backup ownership is now [Beta-Mods/betamods-ops](https://github.com/Beta-Mods/betamods-ops),
a private, owner-only repository containing backup machinery, not a copy of the
application. Do not add backup credentials or privileged backup workflows to
this application repository. The preserved Windows/R2 and Oracle backup tools
belong to their legacy targets and must not be used for this cloud pilot.

Migration checkpoint, September 30: operations run
[36769920931](https://github.com/Beta-Mods/betamods-ops/actions/runs/36769920931)
successfully created and downloaded an encrypted snapshot and restored all
19 tables into a disposable PostgreSQL 18 database. The new nightly schedule is
enabled and the former app-repository workflow is disabled. A second run,
[36772574932](https://github.com/Beta-Mods/betamods-ops/actions/runs/36772574932),
also passed, leaving two verified recovery copies in the operations repository.
The old application-repository backup secrets and all four backup runs and
their artifacts have been removed. Both older encrypted archives were
preserved outside Git before removal.

The operations workflow runs on a standard GitHub-hosted runner, never the
owner's PC. It uses a dedicated read-only Neon role and a separate Supabase S3
key. Supabase's generated S3 key is full-access within its dedicated project,
not a read-only credential. Keep operations access restricted to its owner.

Backups include the consistent database dump and actual referenced file bytes,
with ledger/object reconciliation. AES-256-GCM protects the archive before
upload. Verification downloads the retained artifact, authenticates it, checks
object hashes and restores only into an empty disposable database. Missing or
changed data must fail the job; a failure is not permission to reset quotas or
delete data.

After a replacement passes verification, bounded pruning keeps that snapshot
and the newest previous verified copy. A temporary third copy is permitted
within the 450 MiB repository ceiling; encrypted payloads stop at 149 MiB to
leave room for artifact packaging. Retention is a maximum of 90 days, not an
archive guarantee: snapshots expire if backups stop. Unexpected leftovers
must block another run rather than delete unrelated artifacts.

Actions and Packages storage is shared across repositories. Check combined old
and new usage during cutover and preserve the existing $0 stop-usage controls.
At the 100 MiB file cap, 31 nightly full reads use roughly 3.25 GB of storage
egress before tester downloads. Quotas can stop backups; pause or wait for a
reset instead of adding a paid plan. See [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [Supabase pricing](https://supabase.com/pricing).

Keep the backup decryption key and independent application secrets in an
owner-controlled recovery store. Snapshots do not contain runtime settings.
Never discard keys needed by retained copies. Real disaster recovery requires
an explicitly approved empty target, reviewed schema/file restoration and an
application smoke test before changing runtime URLs; do not restore over the
live pilot.

## Interrupted uploads and storage recovery

Held reservations do not expire automatically. The legacy
`PILOT_RESERVATION_TTL_MINUTES` setting is accepted for compatibility but no
longer frees capacity. A restart can occur after a successful remote upload
but before the database records its result; forgetting that charge would let
the real bucket exceed the application cap. Stale held bytes deliberately
continue to consume both the account and global budgets.

If an interrupted upload leaves held or unlinked storage, pause new uploads
and reconcile the private bucket, settled file references and ledger. Do not
blindly delete reservation rows, increase caps or assume an old request wrote
nothing. Release a charge only after its storage outcome is confirmed and any
unreferenced object has been removed with explicit approval. A failed or timed
out PUT can finish remotely after a cleanup DELETE, so it remains charged even
when that immediate DELETE succeeded. A later inventory/reconciliation must
establish the final outcome. Backup drift failures are an operator alert, not
automatic permission to delete data. No automatic cloud repair is configured.

Cloud S3 operations have a 30-second overall deadline (including response
streams and the entire inventory traversal), a 5-second connection timeout,
and one SDK attempt. Cancellation aborts the request and destroys an active
response stream. Uncertain writes/deletes retain their charge; unreadable
exports fail closed. The non-cloud storage targets keep their previous timeout
behavior. These bounds prevent an indefinitely stalled provider request from
holding the cloud pilot's single mutation/export slot.

## Verified behavior and remaining follow-ups

The private-beta checks have verified account verification and password
recovery, pilot-gate refusals, owner/admin restrictions, unrelated-user denial
of private attachments, scanned clean builds/images/logs, exact-byte downloads,
release-package contents and database/object reconciliation. Five invalid-ZIP
cases and over-pixel images were rejected. Three successive maximum-pixel
images, concurrent mutation refusal and a real idle cold start also passed.
These are bounded observations, not a blanket memory, uptime or security
guarantee.

Keep these unresolved cases visible:

- A particular synthetic image receives an upstream-looking HTTP 403 before
  reservation; the issuing layer and cause remain unconfirmed. Investigation
  is open. Do not retry the blocked file or bypass a protection.
- Hosted EICAR rejection remains unverified because endpoint protection blocked
  the local fixture. Do not disable or bypass antivirus to complete it.
- Remaining decompression/body boundaries and scanner, database and quota-failure
  cases are not all verified on the hosted service.
- Exact 32 MiB and one-byte-over export checks pass offline, not yet through the
  full hosted path. Restart-during-scan recovery also remains unverified.

Start NG was prepared through the normal upload path with its original archive,
scanned cover and requirements. Approved synthetic listings were cleaned up;
do not seed or delete hosted data as part of ordinary contributor checks.
The detailed historical investigation and completion records are retained in
local ignored notes, not maintained as contributor-facing documentation.
A later deployment must record its actual reviewed revision and results
without treating an earlier checkpoint as proof.

If a limit or provider failure is reached, pause uploads or wait for the reset.
Do not weaken scanning, increase cloud caps, clear usage records, add a card or
switch hosting without approval.
