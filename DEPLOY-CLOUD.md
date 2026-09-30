# Bounded cloud-only tester pilot

Status: implementation in progress, **not deployed or ready to share**. Updated
2026-09-29. This is a small, private testing target with no PC dependency, not an
unlimited public mod host. The preserved home and Oracle targets are unchanged.

Account checkpoint: Render account/email verification and Supabase GitHub
sign-in are complete for Beta-Mods. Render's existing GitHub App installation
was verified as limited to `Beta-Mods/beta-mod-hub`. Its undeployed form is set
to native Node, Free, the cloud build/start commands, `/api/health`, and manual
deploys. The reviewed cloud implementation is now in local commits; push and
confirm that revision before submitting the prepared deployment.

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
it is saved privately. No website DNS change, incoming-mail change, deployment
or paid plan was made.

Neon Free schema-only branch `cloud-pilot` (`br-spring-dream-b4iu8p39`) was
created from dev in project `winter-feather-56089874`, with expiry set to Never.
A read-only comparison confirmed its 19 tables, 128 columns, 167 constraints
and 40 indexes match dev; all 19 public tables contain zero rows. Its pooled
connection is saved only in gitignored `.env.cloud.local`; existing dev and
production configuration is unchanged. Independent app secrets and the
existing dedicated Transloadit credentials are also prepared in that private
file. The owner-approved credentials and app configuration have been imported
into Render's undeployed service form. Initial startup obtains `APP_URL` from
Render's own `RENDER_EXTERNAL_URL`, not a guessed hostname; record the actual
origin after creation. Use Chrome for these sign-in flows; the in-app Supabase and Resend
tabs became unresponsive during login.

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
limits; service restrictions can apply. The app's 750 MiB ceiling leaves space,
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
- Images: at most 8 MiB and 8,388,608 decoded pixels. Both the original image and
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
- Storage ledger: 128 MiB/account, 750 MiB total, five approved uploaders and
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
   have been verified; service deployment is still pending.
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
   ready, the sender is verified and a scoped sending key is prepared. Real
   inbox testing remains pending.
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

Health checks query the database and validate configuration. They do not spend
a scan request and **do not prove scanner, storage or email availability**.

## Required before sharing a Discord link

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
- Backup/restore and orphan reconciliation rehearsed for this target. Existing
  home scripts are not automatically validated for Supabase. Retain original
  source archives; no object-versioning/recovery guarantee is being made.
- Inspect provider dashboards and app budgets; verify no payment method or
  automatic overage option was introduced. Record the reviewed revision and
  evidence. Only then share the host URL privately; custom website DNS can wait.

No deployment, end-to-end hosted validation or completed account setup is
claimed by this document. If a quota is hit, pause uploads or wait for reset;
do not weaken scanning, increase cloud caps, add a card or switch to paid compute.
