# Bounded cloud-only tester pilot

Status: **deployed behind the private gate; not ready to share with testers**. Updated
2026-09-29. This is a small, private testing target with no PC dependency, not an
unlimited public mod host. The preserved home and Oracle targets are unchanged.

Account checkpoint: Render account/email verification and Supabase GitHub
sign-in are complete for Beta-Mods. Render's existing GitHub App installation
was verified as limited to `Beta-Mods/beta-mod-hub`. Its service is configured
to native Node, Free, the cloud build/start commands, `/api/health`, and manual
deploys. Commit `3f5cf73` was pushed and deployed successfully on Render Free
as service `srv-dau736ad0e5s73ehajng` (deploy
`dep-dau736qd0e5s73eham6g`). The assigned origin is
`https://betamods-pilot.onrender.com`; startup/build completed in 1m40s.

The Supabase organization `Beta Mods` (`lgbhnbysmhshrugobuqe`) is on Free. The
owner completed the private password step; project `betamods-pilot`
(`yoyusyevjusierybnoaw`) is healthy in US East (North Virginia). Its private
`betamods-pilot` bucket has an exact 8,388,608-byte limit and zero access
policies. The owner approved project-wide S3 credentials for this dedicated
project; the server-only key is saved privately, never in Git or client code.
Resend signup is complete for the project email: its UI
confirms $0/month, no payment method, and overages disabled. Sender subdomain
`mail.betamods.com` is prepared. The owner approved its three email-only DNS
records, which are now saved in Cloudflare (DKIM TXT and two DNS-only CNAMEs).
All three resolve publicly and Resend reports the domain and each record
verified. The owner approved the sending-only key restricted to this subdomain;
it is saved privately. No website DNS change, incoming-mail change or paid plan
was made. Only the owner-approved gated Render pilot was deployed.

Neon Free schema-only branch `cloud-pilot` (`br-spring-dream-b4iu8p39`) was
created from dev in project `winter-feather-56089874`, with expiry set to Never.
A read-only comparison confirmed its 19 tables, 128 columns, 167 constraints
and 40 indexes match dev; all 19 public tables were empty at creation. Its pooled
connection is saved in gitignored `.env.cloud.local` and the dedicated Render
environment; existing dev and production configuration is unchanged. Independent app secrets and the
existing dedicated Transloadit credentials are also prepared in that private
file. The owner-approved credentials and app configuration have been imported
into Render's private service environment. Initial startup obtains `APP_URL`
from Render's own `RENDER_EXTERNAL_URL`, not a guessed hostname; the actual
origin is also saved in the private local configuration. Use Chrome for these sign-in flows; the in-app Supabase and Resend
tabs became unresponsive during login.

Hosted HTTP checks passed 14/14: DB health, anonymous gate redirects, invalid
origin/code refusal, secure 24-hour gate cookie, tampered-cookie rejection and
gated home/login/signup/recovery forms. One expected invalid-code rate-limit
record was retained. Read-only S3 authentication and the empty bucket passed.
A single setup email using the application's real HTTPS mail adapter was
accepted and shown Delivered by Resend to the owner. This is not yet an actual
account-verification/reset round trip. Chrome blocked both automated and manual
gate-form submissions with `ERR_BLOCKED_BY_CLIENT`; ordinary GET navigation
works. Investigation also found a real form bug: the gate document's
`no-referrer` policy makes native POSTs send `Origin: null`, unlike the HTTP
smoke's explicitly supplied Origin. Commit `06f75a2` changes only the form
document to `strict-origin`; null/missing/foreign POST origins remain rejected.
The fixed commit is live in deploy `dep-dau7bgvavr4c7380b5k0` (1m33s).
Actual Chrome native-form retesting now passes: Continue set the gate cookie
and reached the homepage, then normal navigation reached signup. No browser
protection was disabled or bypassed. The fix passed 239 unit tests, typecheck,
lint and the isolated cloud build. The owner then completed real signup and
email verification; delivery was confirmed in Resend and verification in the
isolated pilot database. The owner explicitly approved administrator and
uploader permission; both are now applied and verified in the real admin UI.
The owner-access deployment was `fa1b3a3`, deploy `dep-dau7rodg1s2s73bqf05g` (1m27s).
Eleven subsequent hosted gate regression checks passed without database
writes, mail, scans or uploads.

The first real hosted upload used a synthetic exact-8-MiB ZIP and failed closed
as scanner-unavailable. Its reservation was released, no build was published,
and the private bucket remained empty with zero drift. The 27 estimated MiB
scan charge and upload attempt were retained, not reset/refunded. Read-only
provider inspection found no new Assembly. Investigation found that signed
`auth.max_size` omitted multipart request overhead; Transloadit counts that
overhead in addition to the ZIP envelope. Fix `3a05483` adds 4 KiB of bounded
transport allowance without raising the 8 MiB input limit. All 240 unit tests,
typecheck, lint and isolated cloud build passed. It is live in deploy
`dep-dau835flot8c73a29k50` (1m37s). This failed upload's
7.744-second request sampled 267,812,864-byte RSS and 226,021,376-byte cgroup
usage under the 536,870,912-byte limit. This failed request alone is not an
image/export stress test.

The subsequent real 8-MiB upload passed managed scanning and private storage;
the actual browser download and a separate S3 GET both matched the fixture's
SHA256 exactly. One build/object and stored reservation exist, with zero drift
or held reservations. A concurrent mutation was refused with HTTP 503 while
the upload was active. The successful request took 51.655 seconds and sampled
273,911,808-byte RSS / 254,312,448-byte cgroup usage. These measurements cover
this build upload only. The hosted EICAR test could not reach the server:
Windows antivirus refused reading its inert test ZIP. No reservation or scan
charge was created for it; endpoint protection was not changed or bypassed.
Hosted malware-rejection evidence remains incomplete (the earlier adapter's
synthetic live rejection checks remain historical, not a substitute).

### Latest hosted checkpoint: `2d7b1c4`

Render deploy `dep-dau8ahid0e5s73em6320` succeeded in 1m36s. No paid upgrade,
website DNS change, production-main database write or PC runtime was introduced.

- An 8,388,608-pixel JPEG passed original/canonical scans but reached
  475,385,856-byte RSS and 454,995,968-byte cgroup lifetime peak. Commit
  `2d7b1c4` therefore tightens the cloud-only pixel ceiling to 4,194,304;
  the 8 MiB file ceiling and local-image behavior are unchanged.
- A 2048 x 2048, 16-bit RGBA PNG then passed both scans on the tightened
  profile. Input 6,928,618 bytes; canonical WebP 6,489,170 bytes. The 37.021s
  request sampled RSS 389,435,392 / cgroup 386,576,384 bytes under the
  536,870,912-byte limit. This is one difficult boundary fixture, not proof
  of every permitted format or sustained repeated-upload memory behavior.
- A generated 92-byte diagnostic log passed scanning and the real owner's
  authorized browser download with identical SHA256. Unrelated authenticated
  user denial has not yet been rehearsed on this deployed account set.
- Successful forms exposed a Next internal redirect bug behind Render TLS:
  `ERR_SSL_WRONG_VERSION_NUMBER`. Commit `008638b` sets Next's private internal
  origin to the validated HTTP loopback port before prepare, as its standard
  launcher does. Public HTTPS, Origin/CSRF checks and cookies are unchanged.
  Live edit/save now redirects normally, with no new redirect error observed.
- The real release-package download contained nine entries. Its 8 MiB build
  and new canonical image match their original hashes exactly. ZIP size was
  19,065,538 bytes. Export took 8.968s, sampled RSS 289,701,888 and cgroup
  299,491,328 bytes. This is an approximately 20 MiB input check, not the full
  32 MiB export boundary.
- Read-only pilot DB/S3 audit: four stored objects, 21,128,942 bytes; exact
  ledger agreement, zero held reservations, missing objects or orphans.
  Scan allowance retains 138 estimated MiB of charges (2934 remaining);
  all five hourly upload attempts remain charged. No counters were reset.
- The synthetic test listing was archived using Abandoned status, not deleted.
  Its objects remain retained and count against storage. The owner account and
  uploader approval remain intact.

All 243 unit tests, typecheck, lint and isolated cloud build pass at this code
revision. The earlier 43/43 guarded dev integration result was not rerun here.
Remaining launch gates include hosted rejection/failure and permission cases,
password-reset inbox round trip, repeated/cold-start/restart memory behavior,
full export boundary and off-PC backup/restore. Do not call this Discord-ready.

The owner approved lowering total pilot storage to 100 MiB and storing two
encrypted full snapshots in the private repository's GitHub Actions artifacts.
Dedicated read-only Neon and project-wide Supabase backup credentials are
approved for GitHub Actions; Supabase's S3 key is full-access within the
dedicated project, not read-only. Both initial GitHub-hosted backups and their
downloaded-artifact restore rehearsals have now passed; nightly scheduling is
enabled. The existing Windows/R2 backup scripts are not this target's backup
system. Detailed evidence is below.

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
Share the eventual URL/code only with the few invited testers, not a public
Discord channel. Static assets and the minimal health endpoint are not secrets.

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
   `Beta-Mods/beta-mod-hub` only. Account login and the restricted installation
   have been verified; the gated Free service is deployed.
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
   owner's real signup-verification email was delivered and consumed; the
   password-reset inbox round trip remains pending.
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
| Repository | `Beta-Mods/beta-mod-hub`, reviewed deployment revision |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `APP_URL="$RENDER_EXTERNAL_URL" npm run start:cloud` |
| Health path | `/api/health` |
| Port | Render-supplied `PORT`; launcher default 10000 |

Render sets `RENDER_EXTERNAL_URL` to the service's assigned HTTPS origin. The
start command passes that value into `APP_URL` before loading the application;
this avoids guessing a hostname during first creation. If a custom domain is
later approved, set its exact `APP_URL` and return to `npm run start:cloud`.
[Render default environment variables](https://render.com/docs/environment-variables).

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
Initial real-host evidence after deploy: startup RSS 139,997,184 bytes, cgroup
current/peak 132,194,304 bytes, cgroup limit 536,870,912 bytes. The gate POST
finished in 46 ms with RSS 148,688,896 and cgroup peak 139,132,928 bytes. This is
startup/gate evidence only, not the required upload/image/export boundary test.

Health checks query the database and validate configuration. They do not spend
a scan request and **do not prove scanner, storage or email availability**.

## Encrypted off-PC backups

**Live checkpoint (Sep 29 CDT / Sep 30 UTC):** commit `62bc4fa` is pushed and
deployed on Render (`dep-dau8nfflot8c73a4nbo0`, 1m40s). The real admin page shows
20 MiB stored of a 100 MiB cap and zero held reservations; `/api/health` returns
`{"ok":true}`. GitHub runs `36667662564` (49s) and `36667786194` (1m10s) both
completed successfully on this revision. Each downloaded the actual encrypted
artifact, authenticated all four objects and restored all 19 tables into an
empty disposable PostgreSQL 18 database. Source Neon/Supabase data were never
overwritten. Two initial recovery copies are retained; the first encrypted
payload was 21,181,134 bytes for 21,128,942 bytes of objects plus DB/metadata.
Repository variable `CLOUD_BACKUPS_ENABLED=true` is saved and verified.

271/271 unit tests, lint and typecheck passed. Local isolated build encountered
an EPERM lock on an old `.next-check` OneDrive cache entry; that cache and the
preview were left untouched. The real Render Linux production build succeeded
and the deployed site is healthy. Private-value scanning found no prepared
cloud/backup credential values in staged changes. The nightly trigger itself
has not fired yet; manual runs proved the same job, including artifact transfer
and restoration. Third-copy pruning is covered by unit tests, not a live third
run at this checkpoint.

The approved backup workflow is `.github/workflows/cloud-backup.yml`, running
on standard GitHub-hosted Ubuntu, never the owner's PC. Manual dispatch is for
rehearsal; the nightly 07:23 UTC schedule requires repository variable
`CLOUD_BACKUPS_ENABLED=true`, enabled after the first successful downloaded
artifact restore. A 10-minute job timeout, no
dependency cache and one non-cancelling workflow concurrency group bound usage.

Four private repository secrets are required: `BACKUP_DATABASE_URL`,
`BACKUP_STORAGE_ACCESS_KEY`, `BACKUP_STORAGE_SECRET_KEY`, and
`BACKUP_ENCRYPTION_KEY`. Their prepared values are in gitignored
`.env.backup.local`; do not print or commit that file. Fixed endpoint, region
and bucket are the dedicated pilot's, not an arbitrary destination. No app
administrator database credential is installed in GitHub.

The dedicated `betamods_backup` SQL login has SELECT on public tables and
sequences plus future objects owned by `neondb_owner`, schema USAGE and database
CONNECT. It owns no objects, has no memberships or permanent-data write/CREATE
permissions, and defaults to read-only transactions. PostgreSQL's existing
PUBLIC temporary-table permission is inherited; other roles' permissions were
not changed. Supabase cannot make a generated S3 key read-only: the separate
`betamods-pilot-backup` key has full storage access within only that dedicated
project. Anyone able to run trusted repository workflows can use its secrets.

The core exports a read-only consistent database snapshot and reconciles the
clean file references, storage ledger and bucket. Unexpected, missing, changed
or unaccounted objects fail the job instead of producing a partial success.
The database dump and actual object bytes are encrypted with AES-256-GCM before
artifact upload; neither plaintext data nor credentials belong in job logs or
artifacts. Backups use a separate random encryption key from the application.

Verification downloads the retained artifact, authenticates/decrypts it,
checks each object, and restores PostgreSQL into an empty disposable loopback
database named `betamods_restore_rehearsal`. This is not permission to restore
over the live Neon branch or copy fixtures into it. Real disaster recovery
requires a separately approved empty destination, reviewed schema and object
restoration, and a full application smoke test before switching any runtime URL.

Only after successful verification may retention keep the new snapshot plus
the newest previous verified one. Repository artifact preflight reserves a
third temporary copy and stops above 450 MiB. Encrypted payloads stop at 149 MiB
to allow ZIP framing under 150 MiB per artifact. Unexpected prior leftovers
block rather than trigger deletion of unrelated artifacts. GitHub's 90-day
retention still expires snapshots if backups stop; this is not permanent archival.

GitHub account billing was inspected: Free, 0/2,000 included minutes and
0/0.5 GB Actions storage at setup; Actions and Packages both had $0 budgets
with **Stop usage: Yes**. Preserve those hard stops, not just alert emails.
Artifact storage is shared with Packages and other repositories; the workflow's
repository check cannot account for later unrelated usage. Quota exhaustion
can stop backups. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

At the 100 MiB total data ceiling, 31 nightly full reads use roughly 3.25 GB of
Supabase egress before tester downloads. Its Free 5 GB uncached allowance is
finite; inspect it and pause rather than upgrade. A source archive kept by its
author is still useful even with backups. [Supabase pricing](https://supabase.com/pricing).

Recovery needs the backup encryption key and the application's independent
secrets (especially `ENCRYPTION_KEY` for linked Nexus credentials); snapshots
do not include runtime secret configuration. Keep an owner-controlled copy in
a password manager or equivalent private recovery store. The ignored local
credential files are preparation/recovery copies, not a running PC dependency.
Encryption protects leaked artifacts, not an attacker who controls both the
repository's workflows and its secrets. Do not rotate/delete the backup key
without preserving the key for retained snapshots.

## Interrupted uploads and storage recovery

These safeguards are deployed at `60c5bd2`, Render deployment
`dep-dau90kegekts73dff3u0` (1m55s, build and startup passed). Post-deploy health
and actual private-bucket inventory reads passed. Fault tests are mocked or
against isolated dev data, not evidence of a live provider interruption test.

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

## Required before sharing a Discord link

Password recovery is now verified: the owner completed the real email/reset
flow, the prior signed-in browser is refused at `/account`, the cloud account
has session version 1, and no reset token remains. The new password was entered
only by the owner. Other-user permissions and remaining hosted rejection and
resource-boundary checks below remain separate, unfinished gates.

Subsequent hosted checks passed for ordinary-account admin and owner-edit
denial, plus five harmless invalid-ZIP cases: malformed metadata, encryption
flags, nested archives, checksum mismatch and unsafe paths. The latter left
zero builds on the temporary listing, zero held bytes, unchanged private
storage and unchanged scan budget; five upload attempts remain counted. The
temporary listing is archived. The authenticated QA private-attachment check
subsequently passed through manual in-app navigation, as recorded below.
See `COMPLETION-NOTES.md` for the exact evidence.
The five archive-policy rejects are not evidence of hosted malware rejection.

Sep 30 follow-up: a normal Render service restart completed at 00:07:31 CDT
on the unchanged deployed app revision. The owner remained signed in afterward.
Startup RSS was 145,801,216 bytes, Linux cgroup current/peak 114,749,440 bytes,
and the cgroup limit 536,870,912 bytes. This is an idle restart, not a mid-scan
interruption or an idle autosleep/cold-start rehearsal.

`node scripts/cloud-export-rehearsal.mjs` now exercises the real package
algorithm offline: two exact 32 MiB accounted inputs succeed with all four
payload hashes checked; one byte over fails; temporary outputs are removed.
The subprocess inherits no provider credentials and attempts no network calls.
This is not hosted Next/S3 integration or proof of Render's boundary memory.

The authenticated private-attachment denial check is now passed. The owner
clarified that the earlier `diagnostic.log` download used Chrome's permitted
owner account. They then manually opened the same application attachment URL
inside Codex and reported "not found and nothing to download." The visible
result was independently read as `Not found`, and a fresh account-page load
in the same in-app browser confirmed `admin.betamods+qa@gmail.com`. Read-only
cloud data checks confirm QA is neither the reporter nor the mod owner and the
report/mod association is consistent. No browser protections were bypassed,
sessions extracted, roles changed or alternative download transports used.
This closes that specific permission check, not the other hosted launch gates.

- Account/permission gates above completed without cards, paid plans or broad
  unrelated-repository access; no production DB mutation.
- Correct isolated schema verified; pilot owner can sign up, receive/consume
  verification email, sign in, receive/consume a reset email, and access admin
  only by configured UUID. Unapproved accounts cannot upload.
- Gate rejects absent/wrong/expired codes and signed-cookie tampering; normal
  account, private attachment and hidden-mod permissions remain enforced.
- Actual cloud benign ZIP upload, scan, private storage, presigned download and
  exact-byte comparison pass. Anonymous bucket read/write fail. Signatures
  expire. Gallery original/canonical paths and private attachments pass too.
- Cloud EICAR, malformed/encrypted/nested ZIP, CRC/path/decompression violations,
  oversized body/image and scanner/DB/quota failure fixtures are rejected with
  no served object, leaked quarantine or uncharged object.
- Measure actual Render memory through worst permitted upload/image/export,
  concurrent request refusal, cold start and mid-scan restart. Pass on the real
  512 MB instance before claiming it fits.
- Backup/restore and orphan reconciliation rehearsed for this target: the two
  initial encrypted artifact download/restores passed as detailed above. Real
  disaster cutover to replacement cloud services remains a separately approved
  operation. Retain original source archives; no object-versioning or uptime
  guarantee is being made.
- Inspect provider dashboards and app budgets; verify no payment method or
  automatic overage option was introduced. Record the reviewed revision and
  evidence. Only then share the host URL privately; custom website DNS can wait.

Deployment, real owner verification and the bounded clean-file checks above
are verified, as are the initial encrypted backup/restore rehearsals. The
remaining hosted rejection, other-user permission and memory gates
are still pending. If a quota is hit, pause uploads or wait for reset;
do not weaken scanning, increase cloud caps, add a card or switch to paid compute.
