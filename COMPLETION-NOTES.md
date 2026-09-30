# Local product-completion checkpoint — 2026-09-28

## Bounded cloud-only implementation checkpoint — 2026-09-29

**Historical implementation checkpoint; see "Subsequent gated deployment"
below for the live Free pilot. No full hosted end-to-end or 512 MB memory
validation is claimed.**

### Verified checkpoint after implementation

- Final unit suite: **229/229**; guarded dev integration suite: **43/43**.
  Typecheck, ESLint, isolated `CLOUD_PILOT=on` production build and diff check
  passed. `npm audit --omit=dev`: zero vulnerabilities.
- Actual managed adapter, synthetic live fixtures: **5/5**. Benign text,
  generated PNG and canonical WebP accepted with matching envelope hashes;
  plain and ZIP EICAR rejected. No real mod or user attachment was sent.
- Local production runtime rehearsal: **17/17**, plus three gate regressions.
  Synthetic env only, real env reads/outbound sockets blocked, own loopback
  child stopped. Observed roughly 113-133 MiB RSS for startup/page reads;
  this is not hosted upload/load evidence. Port 3000 was not restarted.
- Review fixes: canonical cloud-flag parsing; static paths bypass the gate only
  for GET/HEAD; all mutation paths still gated; trusted APP_URL redirects preserve
  email/reset destinations; invalid-code traffic cannot lock out valid codes.
  Non-ZIP cloud feedback must be plain UTF-8 text/JSON/INI, not binary saves.
- Render account created and email verified. GitHub app scoped to only
  `Beta-Mods/beta-mod-hub` is prepared but **not installed**: owner approval
  pending. Supabase and Resend signup screens are prepared; account creation
  and terms approval pending. No paid plan/card selected.
- No new pilot database, storage project/bucket, mail domain, web service,
  public URL, DNS change, production migration, commit or push in this pass.
  Application changes remain in the working tree. Continue account setup and
  hosted end-to-end validation before sharing any Discord link.

This checkpoint supersedes the implementation status in the historical provider
evaluation below, while preserving those actual test observations. The owner
requires a few invited testers with no PC dependency and no paid escalation.

The selected target is Render Free native Node 22, a separately verified Neon
pilot branch, dedicated Supabase Free private object storage, Transloadit
Community scanning, and Resend Free HTTPS email. `DEPLOY-CLOUD.md` is the current
runbook; `.env.cloud.example` lists exact variable names without secrets. Real
preparation values must go in `.env.cloud.local` or the host's secret settings.
The old home/Oracle targets and local preview remain preserved, not deployed.

### Repository implementation added

- Bounded cloud profile: 8 MiB files, 128 MiB/account, 750 MiB global storage,
  five approved uploaders and five attempts/hour, with non-raisable ceilings.
  Fixed all-time stored-byte accounting previously filtered by the recent
  rate-limit window; added an old-stored-file regression.
- Supabase S3-compatible private storage with explicit endpoint/region,
  path-style requests, server credentials, presigned GETs and counted bounded
  object reads. Dashboard bucket privacy and actual cloud byte preservation
  still need verification; S3 credentials bypass project-wide RLS.
- Managed scanner adapter sends exact-byte ZIP envelopes, validates explicit
  scanner completion/result identity/full SHA256, rejects unknown errors and
  warnings, and bounds provider response size, polling and timeouts. Original
  and canonical images both require scans; raw Community image processing is
  not used as an identity-preserving scan transport.
- Strict build ZIP policy: 8 MiB compressed and per-member, 32 MiB expanded,
  256 entries, structural/path/CRC checks and refusal of nested, encrypted,
  opaque or malformed containers. This is intentionally narrower than the
  previous upload format/size target; archive validation is not an AV verdict.
- Durable app scan budget in `auth_rate_limits`: maximum 3072 estimated MiB per
  UTC calendar month, charging `3 * ceil((bytes + 1024) / 1048576)` before each
  scan with no refund on unknown/failure. This is conservative bookkeeping,
  **not proof of provider processing charges**. Community stays at its 5 GB
  no-overage hard stop; no card/upgrade is part of the design.
- Separate private access-code gate with signed 24-hour cookies, existing
  verified-account/owner/admin checks, and a Resend HTTPS mail adapter. Exact
  mode strings are required; `CLOUD_PILOT=on` must be set at build and runtime.
- Native cloud launcher checks configuration and built 9mb body limit, refuses
  unbounded/oversized bodies before parsing, and admits one mutation/export at
  a time. Image pixels are capped at 8,388,608; Sharp fan-out/cache are bounded.
- Promotion exports count actual build/media/text bytes plus entry overhead
  against a 32 MiB input cap and check source metadata at 1 MiB. Errors clean up
  temporary output. Existing non-cloud behavior is preserved.

These controls allow an explicitly **small synchronous pilot** to be tested.
They do not complete or replace the durable direct-upload/job architecture
needed for future 250 MiB files. Do not increase caps to make a refused mod fit.

### Remaining external and release gates

- Render account login/GitHub App permission for the single project repository;
  Free native Node service configured and built from a reviewed revision.
- Supabase Free account/project/private bucket/S3 setup, no anonymous reads or
  writes, and upload/read/delete/presign byte-identity checks.
- Resend Free account and sender-domain verification, with real verification
  and reset emails consumed from a tester inbox. Free pricing is 100/day and
  3,000/month; do not enable paid transactional overages.
  [Resend pricing](https://resend.com/pricing).
- Explicit isolated Neon pilot target/schema review. No production migration
  or automatic build-time database mutation; dev preview env stays unchanged.
- Real cloud upload/gallery/private-attachment/scan/reject/download flow,
  permission and quota failure tests, memory peaks on the actual 512 MB host,
  interrupted upload/cold start behavior, backup restore and orphan accounting.
- Provider-plan/no-card checks, upload privacy disclosure, and a private-only
  invitation handoff after the gate passes. No website DNS/tunnel change or
  Discord-share readiness is implied by this checkpoint.

Repository unit tests and local build checks cannot substitute for these
external gates. This progress record intentionally does not assert a final
combined test total while implementation and integration review continue.

Targeted dev-database recheck: the new aggregate initially bound a JavaScript
`Date` directly in raw SQL, bypassing Drizzle's timestamp encoder and making
reservations fail closed. It now binds an ISO string with an explicit
`timestamptz` cast. After that repair, the storage-ledger integration suite
passed 12/12 (including old stored bytes and both concurrent cap races), followed
by media-management 7/7 (including reservation resizing). Both completed their
fixture cleanup. These are dev-only integration results, not a full-suite rerun,
production migration or hosted cloud validation.

## Cloud-only pilot evaluation — 2026-09-29

Historical provider evaluation before the bounded implementation above:

This section supersedes the old home-hosting decision, not the historical test
results below. The owner requires **no PC dependency** and no automatic paid
upgrade. Nothing in this evaluation is a public deployment.

Candidate: free cloud web hosting + Neon Free + private object storage + managed
Transloadit scanning. Preserve the existing preview, Oracle/home configuration,
uploads and database while evaluating this alternative.

### Provider gate, before integration

- Use only generated benign fixtures and standard EICAR test fixtures. Do not
  submit users' unpublished mods, account data, R2 keys or database credentials.
- Keep evaluation keys in gitignored `.env.transloadit.local`; the template is
  `.env.transloadit.example`. No credentials or Assembly/file URLs in logs.
- Require successful completion, the expected scanner output bound to its exact
  input, no skipped/ignored errors, and byte identity. Completion by itself is
  not a clean verdict. Never accept a missing scan result as a clean file.
- Live provider tests must cover benign text/ZIP/image, EICAR plain/ZIP/nested
  ZIP, invalid/encrypted archives, scan-size/depth limits, quota exhaustion,
  service errors and unchanged bytes. Small-fixture success does not validate
  the app's 250 MiB archive ceiling or all supported archive formats.
- Community's recurring 5 GB is **processing usage**, not necessarily 5 GB of
  original uploads. Multiple processing steps, minimum charges and retries
  consume allowance. Scan-only image watermark behavior needs verification.
- Transloadit temporarily retains files for approximately 24 hours; update the
  upload disclosure/privacy page before sending tester files to this provider.

### Live synthetic evaluation results (2026-09-29)

The Transloadit workspace is on Community with no credit card. After the initial
tests the billing page showed 10 MB of 5 GB used and a $0.00 total fee (usage can
lag; two further tiny synthetic envelope tests followed). Existing credentials
were saved privately to the gitignored evaluation file. No key was created or
plan upgraded by this evaluation. Match the dashboard's signature algorithm;
the existing named key uses SHA256, not the new-key default SHA384.

`scripts/transloadit-probe.mjs` defaults to an offline dry run. `--live` runs
only nine generated fixtures, with no app/database/storage env fallback or
arbitrary file/URL inputs. It has bounded transport, one POST per fixture, no
POST retry, and redacted output. Tests cover errors, quota/timeouts, missing or
ambiguous results and exact input identity. It is not a production scan adapter.

Actual provider observations:

| Synthetic input | Result |
|---|---|
| Plain text and benign ZIP | Scanner completed; result identity and provider full SHA256 matched the input. |
| EICAR plain, ZIP and nested ZIP | All explicitly rejected by the virus scanner. |
| Malformed five-byte ZIP | Provider completed rather than rejecting the invalid archive; the probe correctly reports unexpected acceptance. |
| Raw PNG (91 bytes) | Community processing changed the upload and both outputs to 625 bytes; original identity/hash validation failed. Do not use this path for original images. |
| ZIP carrying the exact PNG | Scan and provider full SHA256 matched the complete 218-byte envelope. |
| ZIP carrying EICAR named pixel.png | Explicitly rejected by the virus scanner. |

The API includes an informational Community watermark notice even for text and
ZIP inputs. The probe recognizes only that exact notice and still requires all
completion, scan, identity and hash checks. Unknown warnings/errors remain
non-clean. This is not permission to ignore warnings in a future production
adapter. The complete nine-fixture run is expected to remain non-green while
the deliberately malformed ZIP and raw PNG expose these limitations.

Image envelopes are a promising scan transport, not implemented app behavior:
the server must bind an envelope to the exact immutable original/canonical
image, enforce size/concurrency limits, and never trust a client-supplied
manifest. Independently downloaded byte preservation remains untested. Archive
validation is separate from malware detection; malformed/encrypted formats,
250 MiB coverage, decompression size/depth limits and free-host memory remain
launch gates. Do not weaken these checks just to make the probe green.

No real mods or R2 credentials were uploaded. No application uploads, production
database, DNS, tunnel, public hosting or running preview were changed. Nothing
was committed or pushed during this evaluation.

Repository verification after the probe additions: 150/150 unit tests (including
20 probe tests), typecheck, lint and isolated `.next-check` production build
passed. No DB-mutating integration or E2E suites were run in this evaluation.

### Code/deployment gates found during the audit

1. `uploadBuild`, local quarantine, `scanUpload` and R2 promotion buffer whole
   files. Do not put the current 250 MiB multipart flow on a 512 MB free runtime.
   Use metadata-only initiation, direct private uploads and durable upload jobs.
2. Reserve capacity before issuing an upload capability. Verify actual size and
   immutable content identity, authenticate and independently verify completion,
   then recheck owner/account/mod permissions before idempotent publication.
   Pending files must never have a public download route.
3. Keep pending and failed-cleanup bytes charged until their deletion is
   confirmed; current expiration of local-scratch reservations cannot be reused
   unchanged for durable cloud quarantine. Reconcile lost callbacks after
   restarts without relying on in-process background promises.
4. Existing `reserveStorage()` per-user totals are incorrectly filtered by the
   recent rate-limit window. Fix all-time active-byte accounting separately
   from recent upload attempts and add an old-upload regression before launch.
5. Migrate builds, private feedback attachments and both image scan stages.
   Preserve canonical image handling, private attachment authorization and all
   lost-commit/cleanup protection. Stream or bound promotion ZIP generation too.
6. Render Free blocks SMTP ports 25/465/587; current account mail needs an HTTPS
   delivery adapter and real verification/reset inbox tests. Never expose local
   preview mail or the development-only unverified-account bypass.
7. Replace ClamAV-specific runtime startup/readiness only once managed scanning
   is validated. Do not spend a scanner request on every health probe. Confirm
   free-runtime memory, cold starts, backup/restore, isolated pilot DB migrations
   and whole-site invite restrictions before any Discord link is shared.
8. R2 is metered beyond its free allowance. Do not promise zero billing solely
   from its 8 GiB app cap: requests and other account usage also matter. A strict
   no-overage storage choice must be decided and tested before public deployment.

Sources checked 2026-09-29:
[Community plan](https://transloadit.com/pricing/),
[scan Robot](https://transloadit.com/docs/robots/file-virusscan/),
[Robot usage accounting](https://transloadit.com/docs/robots/pricing/),
[privacy](https://transloadit.com/legal/privacy/),
[Render Free restrictions](https://render.com/docs/free).

## Implemented

- Account verification/recovery/change-password; hashed expiring single-use
  tokens, database throttling, session revocation and suspension. Admins are
  explicitly configured by UUID, never by an unverified email address.
- Build-specific votes reject stale forms. Shared transactional locks prevent
  changes after publication, archive or moderation, including scans in flight.
- Owner-managed screenshot gallery: decoded and metadata-stripped images,
  original and normalized ClamAV scans, captions/order/cover/removal, private
  R2 delivery, and screenshots in release packages.
- Search, game filters, pagination and current-build sorting; formatted safe
  Markdown; followed mods and private in-site notifications.
- Structured bug reports, author responses, reporter retests, filters/paging,
  private scanned attachments and quota cleanup. Upload forms retain text on
  error and show an honest uploading/scanning state, not fake percentages.
- Reporting/moderation, account suspension, audit records, contact/rules/privacy
  pages, loading/error/not-found states and dependency health endpoint.
- A loopback-only native preview launcher with process-identity checks and no
  Docker dependency. See `LOCAL-PREVIEW.md`.

## Verified on this machine

- `npm run lint`, `npm run typecheck`, `npm test`: clean; 115 unit tests.
- `npm run test:integration`: 35/35 against the isolated Neon dev branch.
- Production compilation: all 28 routes compile using
  `BETAMODS_BUILD_CHECK=1` (isolated `.next-check` to avoid a locked old
  OneDrive `.next` cache entry).
- R2/pilot build upload e2e: 29/29, including EICAR rejection, invite gate,
  kill switch, short-lived signed downloads and cleanup.
- Bug workflow HTTP e2e: 22/22, including private attachment authorization,
  live malware rejection, stale votes, retest and published-form replay.
- Profile HTTP e2e: 11/11; prior demo profile text restored.
- Start NG's authorized Dragon/Friends backgrounds imported through the full
  real scan pipeline. Both `/media/:id` redirects served identical stored bytes.
- R2 audit after test cleanup: four objects, 3,380,812 bytes, no missing objects,
  orphaned objects or retained unlinked reservations.
- Native stop/start/status and repeated start tested; all listeners loopback.
- Docker Compose configuration validation passes for the home target plus
  loopback overlay. This does not mean Docker's engine or containers are running.
- Browser: gallery selection/enlargement, real imagery, phone-sized Browse
  without horizontal overflow, search empty state, account/admin access.
- `npm audit --omit=dev`: zero reported vulnerabilities.

Tests found and fixed a stale e2e selector that chose the new image form instead
of the build form. A limiter-expiry test used the laptop clock against remote
PostgreSQL; it now uses the DB clock and isolated test buckets. Neither fix
weakens a production check.

## Deliberately not completed or represented as live

- No production Neon migration, DNS change, tunnel, new cloud resources or
  public deployment. `.env.home` still points at dev for this preview.
- SMTP inbox delivery is not configured. Local recovery mail is a private file,
  never a public endpoint; verification bypass is explicit and non-production.
- Docker Desktop's Windows socket failure is not repaired. Production container
  startup and an isolated backup/restore rehearsal still need completion.
- Nexus OAuth still requires registered credentials and live reconciliation.
- R2 inventory is not an archive backup or a billing cap. Existing pilot caps
  remain in force; this work does not promise unlimited free hosting.

## 2026-09-29 cloud account checkpoint (not deployed)

- Resend Free created for the project account; no card or overages. The owner
  approved three email-only DNS records under `mail.betamods.com`; all three
  are saved and verified. Website DNS and incoming mail were not changed.
- Dedicated Supabase Free project and private `betamods-pilot` bucket created;
  exact 8,388,608-byte object limit, zero anonymous-access policies. The owner
  completed the private password step. Project-wide S3 access is confined to
  this dedicated project, not the other site.
- Neon schema-only `cloud-pilot` branch is isolated, non-expiring and empty.
  Read-only comparison: 19 tables, 128 columns, 167 constraints and 40 indexes
  match dev. No production database mutation or migration was performed.
- Owner-approved storage and sending-only email keys are saved in ignored
  `.env.cloud.local` and imported into the prepared Render Free form, with
  independent app secrets and the dedicated Transloadit credentials. Actual
  Render deployment and hosted checks remain pending.
- Render's start command derives the initial application origin from its
  documented `RENDER_EXTERNAL_URL`; no service hostname is guessed.
- Fresh local checks: 229/229 unit tests, typecheck and lint pass. Private
  cloud/Transloadit secret-value scan found no matches in commit candidates.
- Cloud implementation preserved in local commits `25f1230`, `fc83a87`, and
  `29a897c`. The working local preview and earlier hosting targets are intact.

### Subsequent gated deployment

The owner approved the gated Free launch. Commit `3f5cf73` was pushed to
`Beta-Mods/beta-mod-hub` and successfully deployed on Render as
`https://betamods-pilot.onrender.com` (service `srv-dau736ad0e5s73ehajng`).
Build/start took 1m40s. Manual deploys remain enabled; no paid resources, custom
website DNS or PC runtime were introduced.

Hosted HTTP checks passed 14/14 (health, gate rejection/cookie controls and
account forms), private S3 credentials passed a read-only empty-bucket check,
and the application's setup-test email was marked Delivered by Resend.
Chrome blocked both automated and owner-submitted gate POSTs with
`ERR_BLOCKED_BY_CLIENT`; a normal GET still loads the gate. The HTTP smoke
explicitly supplied Origin, missing the native-form behavior under the gate's
`no-referrer` policy. Commit `06f75a2` fixes that form response to `strict-origin`
while preserving null/missing/foreign-origin rejection, cookie flags and
token-safe redirects. That commit is now live (deploy
`dep-dau7bgvavr4c7380b5k0`, 1m33s); native Chrome Continue succeeded and normal
navigation reached signup. No browser security setting was disabled or
bypassed. The owner then completed signup and real email verification. Resend
shows delivery and the isolated database confirms verification; no development
account was copied or session minted. The owner subsequently approved admin
and uploader access; both are verified live at `fa1b3a3`, deploy
`dep-dau7rodg1s2s73bqf05g`. Eleven additional hosted gate checks passed. This is not a completed
password-reset or hosted upload rehearsal. Memory
boundary tests and backup/restore are still required before inviting testers.

Private numeric memory evidence added in `aebfca1` avoids Render Free's paid
metrics UI: startup RSS 139,997,184 bytes / cgroup peak 132,194,304; gate POST
RSS 148,688,896 / cgroup peak 139,132,928; actual limit 536,870,912. No public
metrics endpoint or request data was added. Final local gates at `06f75a2`:
239/239 unit, typecheck, lint and isolated cloud build passed. Local preview
and cloud `/api/health` both returned 200/ok at that checkpoint.

First hosted upload rehearsal: a synthetic exact-8-MiB ZIP failed closed as
scanner-unavailable after 7.744 seconds. No build or stored object exists;
storage reservation was released and zero drift confirmed. The scan budget
retains its 27 estimated MiB charge and the attempt remains counted. Signed
read-only provider inspection found no new Assembly. The scanner's signed
size ceiling omitted multipart request overhead; fix `3a05483` adds bounded
4 KiB transport allowance and a real serialized-request boundary regression.
240/240 unit, typecheck, lint and isolated cloud build pass; deployed as
`dep-dau835flot8c73a29k50` (1m37s). Failed-path
sampled RSS was 267,812,864 bytes, cgroup usage 226,021,376 bytes, limit
536,870,912 bytes. This is not a successful hosted scan or image/export memory
gate. No file cap, budget, scan policy, paid plan or website DNS was relaxed.

The 8-MiB retry succeeded through actual hosted scan -> private S3 -> browser
download. Both downloaded bytes and a separate S3 GET match fixture SHA256
`d4a795a68ea068f3ef0486a0a1e2ef8117f0dbd251a9e7d7a3f52c64c2ecddf7`.
One build/object, zero drift/held reservations; budget 54 estimated MiB at this
checkpoint, 2 attempts retained. A concurrent mutation received HTTP 503 during
the upload. Successful request 51.655s, sampled RSS 273,911,808 and cgroup
254,312,448 bytes (512 MiB limit). Hosted EICAR then stalled before reaching the
server: Windows antivirus blocked reading its inert ZIP. No provider job,
reservation or charge; protection unchanged. Hosted rejection remains unverified.

### Hosted image/export checkpoint (Sep 29 CDT / Sep 30 UTC)

- `008638b` fixes Next internal action redirects by using the validated HTTP
  loopback origin; public HTTPS/CSRF/cookies are unchanged. Live edit/save now
  navigates normally, with no new redirect SSL error observed.
- `2d7b1c4` lowers cloud images to 4,194,304 pixels after the earlier 8 MP test
  reached RSS 475,385,856 bytes. Local image limits remain unchanged. Both
  commits are pushed; latest Render deploy `dep-dau8ahid0e5s73em6320` is live.
- New 2048 x 2048, 16-bit RGBA stress fixture passed original/canonical scans:
  6,489,170-byte WebP, exact SHA256 verified. Measured peak RSS 389,435,392 /
  cgroup 386,576,384 bytes out of 536,870,912, duration 37.021s. One difficult
  fixture, not a sustained-load or exhaustive-format guarantee.
- Private 92-byte diagnostic attachment passed scan and authorized owner
  download/hash verification. Other-user denial still needs hosted rehearsal.
- Actual 19,065,538-byte release-package download contains nine entries;
  embedded build and new image hashes match. Export sampled RSS 289,701,888 /
  cgroup 299,491,328 bytes over 8.968s. Full 32 MiB input boundary not tested.
- Final read-only DB/S3 audit: four objects, 21,128,942 bytes; exact ledger,
  no held reservations, missing objects or orphans. Scan counter retains 138
  estimated MiB; five hourly attempts retained, next naturally frees at
  04:14:49 UTC. No quota bypasses. Temporary listing archived as Abandoned,
  objects retained and charged, nothing permanently deleted.
- Exact-code gates: 243/243 unit, lint, typecheck and isolated cloud build pass.
  Prior 43/43 dev integration evidence is unchanged, not a fresh run here.
- Still private, not Discord-ready. Remaining gates: hosted rejection/failure
  and permission cases, password reset, repeated/cold/restart memory checks,
  full export boundary and off-PC backup/restore. Backup proposal requires
  approval to reduce total storage to 100 MiB and grant private GitHub Actions
  access to dedicated backup credentials. Nothing scheduled or granted yet.

### Approved encrypted off-PC backups — complete

The owner approved the 100 MiB total cloud cap and dedicated backup credentials
in the private GitHub repository. Commit `62bc4fa` adds the bounded encrypted
backup core, fault tests, workflow and retention safeguards; existing hosting
targets remain unchanged. No card, paid resource, custom website DNS or PC
hosting dependency was added.

- Dedicated `betamods_backup` SQL role: SELECT only on permanent public data,
  no object ownership/memberships/CREATE/write, read-only transaction default.
  Existing inherited TEMP permission retained; PUBLIC/other roles unchanged.
- Separate Supabase S3 key `betamods-pilot-backup`; full access confined to the
  dedicated project, as disclosed/approved. Four backup secrets saved in private
  GitHub Actions settings and gitignored `.env.backup.local`; none printed.
- GitHub Free account had unused included quotas and $0 Stop-usage budgets for
  Actions and Packages. These remain unchanged. Workflow uses standard Linux,
  10-minute timeout, no cache, private/main guards and bounded two-copy retention.
- Runs `36667662564` (49s) and `36667786194` (1m10s) both succeeded: actual
  encrypted artifacts uploaded, downloaded, authenticated, four object hashes
  checked, and all 19 tables restored into fresh disposable PostgreSQL 18.
  Live DB/bucket were never restored over. Two initial copies retained.
- `CLOUD_BACKUPS_ENABLED=true` saved/verified; nightly schedule 07:23 UTC.
  Schedule has not fired yet; manual dispatch ran the same verified job.
- Render deploy `dep-dau8nfflot8c73a4nbo0` succeeded (1m40s); admin UI confirms
  20 MiB of 100 MiB total, no held bytes, health 200/ok. Per-file cap still 8 MiB.
- 271/271 unit, lint and typecheck pass. Local isolated build hit EPERM on an
  old OneDrive `.next-check` cache entry; no cache/preview deletion. Real Render
  Linux production build passed. Secret-value scan passed before commit/push.
- Backup plaintext exists only in private temporary runner files; encrypted
  artifacts require the independent backup key. Owner recovery copies must stay
  private. Runtime secrets are not embedded in data snapshots. A replacement
  cloud cutover still needs explicit review/approval, never automatic overwrite.

The pilot remains gated. These backups close that setup item, not the remaining
hosted rejection/permission/password-reset and memory-boundary launch checks.

### Restart and storage timeout hardening (Sep 30 UTC)

The next launch review found that the old reservation TTL could forget a
successful remote PUT if the process died before database settlement. Held
reservations now remain charged regardless of age; only released history is
pruned. Builds, private attachments and media also retain capacity after an
unacknowledged PUT even if an immediate DELETE succeeds, because a late remote
write can race that cleanup. No new schema or automatic destructive repair.

Cloud S3 operations now have a 30-second deadline covering the request and
response body/all inventory pages, real transport abort/stream destruction,
5-second connection timeout and one SDK attempt. Noncloud timeouts unchanged.
Fault tests include a stalled body, ignored cancellation with late response,
pagination timer starvation and a late PUT after successful DELETE.

- 289/289 unit tests, typecheck, lint and diff checks pass.
- 12/12 storage-ledger integration checks pass on the recorded isolated dev
  endpoint, checked distinct from both production and cloud before running.
  The aged-hold regression proves global/account caps stay charged and an
  explicit release of a known object-free test fixture restores capacity.
- Hosted read checks confirm health, anonymous gate redirects, forged-cookie
  refusal, secure normal gate-cookie issuance and 404 for an existing private
  attachment without an account session. Non-admin /admin returns a streamed
  redirect home with no admin controls; an initial test incorrectly expected
  an HTTP redirect to /login and was corrected after inspecting requireAdmin.
- Owner account remains verified and signed in. No owner password reset, new
  account, hosted malware fixture, cloud data mutation or quota bypass occurred.
- Docker independently reproduced its Windows sailor-ingest.sock rename error.
  Cloud health stayed OK. No reset, deletion, uninstall or security changes.

Commit `60c5bd2` is pushed and live on the same Render Free service. Deployment
`dep-dau90kegekts73dff3u0` passed its real Linux production build and startup in
1m55s. Post-deploy health returned 200/ok; the signed-in admin page successfully
read the private bucket through the new S3 deadline path (four objects, 20 MiB,
100 MiB cap, zero held). This is not a fresh upload/export or interruption test.
Remaining hosted checks are still pending and the pilot stays private. No new
credentials, migration, plan, custom DNS or local-preview change was made.

### Hosted password recovery verified

The owner approved a reset email to the existing project account, completed
the email link and chose the replacement password privately. The hosted UI
shows `login?password=reset` with the successful reset/sign-out message; the
previously authenticated tab's `/account` request now lands on sign-in.
A read-only check of the exact isolated cloud branch confirms the owner is
active and verified, `session_version=1`, and zero reset-password tokens remain.
No password/hash/cookie/token was read, printed, minted or changed by the agent.
This closes the real email/reset/sign-out gate, not the separate second-tester
attachment denial, hosted rejection/restart or full export boundary checks.

### Ordinary tester account and permission checks

With explicit owner approval, created `admin.betamods+qa@gmail.com` through
the hosted signup form with a generated password kept out of chat and Git.
No administrator or uploader permission was granted. Its separate in-app
browser session shows the QA email on `/account`; email verification remains
pending. The owner's Chrome session is separate and was confirmed signed in
again after password recovery.

- The authenticated QA account's `/admin` navigation redirected to the home
  page without admin controls.
- The existing, non-hidden, abandoned system-test listing renders for QA.
  Its private diagnostic attachment link and owner controls are absent.
- Direct navigation to that listing's `/edit` redirects to its detail page
  without an edit form. The GET authorization paths checked here do not use
  email verification as an earlier gate, so these are meaningful non-admin
  and non-owner checks despite the QA address not yet being verified.
- Direct private-attachment navigation was blocked by the browser with
  `ERR_BLOCKED_BY_CLIENT`, leaving the previous page visible. This is NOT
  evidence of an application 404 or authorization pass. No alternative
  transport, session extraction, protection change or retry was used to
  work around it. Authenticated non-owner direct-download denial remains
  unverified; prior gate-only 404 evidence is a separate check.

No upload, listing mutation, role approval, quota change, schema migration,
deployment, DNS or paid-service change occurred. The pilot remains gated.

### Hosted archive-policy rejection checks

The owner approved five harmless invalid-ZIP submissions and archiving the
system test afterward. The previous archived listing correctly refused an
attempt to reopen it through its edit form. It was left untouched. A separate
temporary system-test listing (`1357385f-8a34-4aa4-ae01-8a153d3bd449`) was used
instead, then archived with the results recorded in its description.

All five browser submissions on the existing Render deployment produced the
exact expected policy messages: malformed metadata, encryption flags, nested
benign ZIP, checksum mismatch, and unsafe member path. Four fixtures were 184
bytes each; the nested fixture was 304 bytes. They contain only generated text,
no personal files, malware marker, compression bomb or security bypass.

Read-only before/after audit of the exact isolated cloud database and private
bucket confirmed zero builds on the new listing, one existing build overall,
four stored objects totaling 21,128,942 bytes unchanged, and zero held bytes.
Five new reservations (1,040 bytes total) were released normally. All five
attempts remain counted in the hourly window; none was reset or refunded.
The app's monthly managed-scan charge remained 138 estimated MiB, consistent
with rejection before the scanner call. Hosted quarantine disk contents were
not independently inspected; the deployed action's finally cleanup is not
being represented as a new filesystem observation.

New offline tooling `scripts/cloud-rejection-fixtures.mjs` validates all five
expected rejects and one accepted baseline with the real archive validator
before writing a fresh temporary fixture directory. The accepted baseline
stays local. Five focused unit tests cover deterministic bounded fixtures,
CLI restrictions and fail-before-write validation; no live mode exists.

This closes those five hosted archive-policy cases, not hosted malware
rejection, scanner/DB failure injection, decompression-size violations,
authenticated private-attachment direct denial, or the remaining resource
checks. No deployed application code, paid plan, DNS, quota, approval or local
preview setting changed. The pilot remains private.

### Idle restart and exact offline export boundary (Sep 30 CDT)

The unchanged Render service was restarted through its normal dashboard.
Instance `k6b96` reported a successful startup at 00:07:31 CDT: RSS 145,801,216
bytes; cgroup current/peak 114,749,440 bytes; limit 536,870,912 bytes. The owner
account remained signed in and email-verified afterward. No upload was active
and the ledger had zero held bytes. This closes an ordinary restart check only,
not mid-scan interruption or autosleep cold-start behavior. No plan, command,
credential, cap or application code was changed.

Added a bounded offline export rehearsal and three regression tests. A fresh
credential-free subprocess with a 256 MiB JS heap runs the real package builder
against synthetic, temp-only sources. Two exact 33,554,432-byte accounted inputs
succeed, all four source hashes match the ZIP entries, and one byte over is
refused. Network attempts are zero and temporary output cleanup is verified.
The root rerun's Windows process peak RSS was 151,425,024 bytes; Linux cgroup
counters are unavailable locally. These are algorithm checks, not hosted route,
S3 or scanner evidence. The focused export/memory suite passed 19/19 tests.

The post-restart owner export download attempt timed out in browser tooling;
no resulting path or bytes were confirmed. Do not count it as success or infer
a server failure from the tool timeout. The prior smaller hosted export remains
separate evidence.

The owner then reported a file download during the manual QA private-attachment
check. Browser/account and filename remain unconfirmed: Chrome's owner account
is permitted, while the separate in-app QA account is not. A pinned read-only
cloud DB query confirms `diagnostic.log` is clean, its report/mod association is
consistent, and QA is neither owner nor reporter. Review found no cross-request
session cache or authorization difference between deployed `60c5bd2` and HEAD;
authorization runs before signing/reading storage. This is still an unresolved
release blocker, not a confirmed leak and not a permission-check pass. Browser
security blocks were not bypassed and no cookies or signed URLs were extracted.

### Authenticated private-attachment denial verified (Sep 30 CDT)

Resolved the preceding ambiguous download report: the owner confirmed it was
`diagnostic.log` in Chrome, which was signed into the permitted owner account.
They then manually navigated the in-app browser to the original application
attachment URL (`a237c8e8-29a5-4f94-8a91-4d785d3489cc`) and reported "not found
and nothing to download." Browser inspection of that already-open page showed
`Not found`. A fresh `/account` load in the same in-app browser confirmed the
separate `admin.betamods+qa@gmail.com` session was still authenticated.

The user performed the navigation; automation only observed the result and
checked the account afterward. The previously blocked automated request was
not retried or rerouted. No browser protections, credentials, roles, storage,
database rows or application code changed. No signed URL or session cookie was
extracted. The actual HTTP status was not independently captured; the evidence
is the rendered denial, confirmed QA identity and user's no-download report.

This closes the authenticated non-owner private-attachment check. The earlier
automated browser block remains historical, not a passing request. Other
hosted rejection/resource checks remain separate and the pilot stays gated.

### Full-upload follow-up: hourly refusal and HTTP transport (Sep 30 CDT)

The owner declined a design-only invitation and asked to finish upload testing.
No invitations were sent and uploads were not disabled. Existing caps, provider
plans, DNS and the local preview are unchanged.

A fresh synthetic listing (`60d7d4ed-ce05-4db4-b99e-631e667bd1eb`) received a
125-byte harmless invalid-ZIP attempt while the owner's five previous attempts
still occupied the hourly window. The live form displayed the five-per-hour
refusal. A pinned read-only pilot audit at 05:52:46 UTC confirmed zero builds,
media or linked reservations on that listing, zero held bytes globally,
21,128,942 stored bytes and unchanged 138 MiB estimated scan usage. The previous
attempts were not reset or deleted. Selecting an 8 MiB+1 file also showed the
client-side size error and disabled submission; that is not hosted server-side
rejection evidence.

At 05:43:39 UTC a health request returned 200/ok in 463 ms after the intended
idle interval, but no new startup was observed. Do not count this as a cold
start. A single unauthenticated 9 MiB+1 ordinary POST then returned upstream
502 in 692 ms, not the expected application 413. Subsequent health was 200/ok
and application logs showed no crash/restart. The request was not retried by
changing its transport or reducing it to headers-only.

Loopback reproduction isolated an early-response lifecycle problem: immediate
Connection: close caused normal whole-body requests to reset, while a
header-first request had hidden this issue. The shared HTTP handler now sends
a length-delimited refusal before bounded discard (10 MiB, two seconds, four
concurrent grace drains). Rejected input never enters Next or takes a work
slot; the accepted body cap remains 9 MiB. Saturated discard slots close
immediately with best-effort refusal. The actual shared handler passes full
9 MiB+1 bodies with keep-alive and client-requested close, occupied-slot 503,
subsequent valid requests and discard bounds on both Node 22.23.3 and Node 26
(14 focused handler/runtime tests). Deployment and hosted recheck are still
pending at this checkpoint; the old 502 is not relabeled as a passing test.

Offline boundary and positive-export generators use harmless generated data,
no credentials, no network and no malware fixture. The positive set is five
normal uploads, including an 8 MiB ZIP and four still images below the file and
pixel caps. Browser form CRLF serialization is explicitly accounted for; the
listing's 228-byte stored description and changelog `Synthetic capacity fixture`
(no period) produce exactly 32 MiB accounted export input if hosted canonical
images match the verified offline hashes. Expected scan accounting is 183 MiB
for nine scans, including envelope rounding. Hosted upload/export results are
recorded separately, not inferred from these offline checks.

### Repeated maximum-pixel uploads exposed live memory failure (Sep 30 CDT)

The normal 8 MiB build upload passed (`aeb34f00-81a7-4fa0-86f1-0faa1a1141eb`),
followed by two separately scanned 2048x2048 generated WebP originals. Stored
canonical sizes are 6,781,706 and 6,781,932 bytes. The third image submission
showed the application error boundary. Render Events explicitly confirmed
`Ran out of memory (used over 512MB)` at 00:59 CDT, then automatic recovery.
No test image was resubmitted and the fourth image was not uploaded.

The first image's measured cgroup peak was 505,516,032 bytes. The second reached
the exact 536,870,912-byte cgroup limit (process high-water RSS 583,581,696 bytes).
The third has no completed exclusive-operation log; startup resumed at
00:59:39 with RSS 141,606,912 and cgroup current 116,056,064 bytes. Prior individual
image success does not establish repeated-upload safety. The 32 MiB hosted
export test is unfinished; do not call the cloud pilot ready for invitations.

Pinned read-only audit at 06:01:41 UTC found one build and two images on this
listing. The third upload's 7,182,348-byte reservation remains held
(`c74f5232-135b-495d-a97f-4a9d01a53a9e`, created 05:59:07.390 UTC), without a
published media/build reference. Estimated scan usage is 270 MiB: the third
original scan is charged but its canonical scan is not. This is consistent
with interruption during decode/encode, before reservation resize, not proof
of the exact allocator cause. All seven private-bucket objects match the seven
database references (43,081,188 bytes); no missing or orphaned objects were found.
The held charge was not released, caps were not changed, and no paid service,
PC hosting, invitation or automatic repair was introduced.

After automatic recovery, the owner's session and the one-build/two-image
listing rendered normally. A separate harmless 537-byte ZIP with an excessive
declared expanded size was refused with the correct 32 MiB expansion message.
Its new reservation (`e7b2d35f-fb1d-411b-83b7-ebcfd66b9c22`, 06:06:10.635 UTC)
is released; a read-only audit confirms stored files, the earlier held charge
and 270 MiB scan allowance are unchanged. No failed image was retried. The next
five attempt slots naturally expire at 06:55:39.760, 06:56:53.792, 06:57:49.020,
06:59:07.390 and 07:06:10.635 UTC; they were not reset for testing.

The first output-preserving memory fix explicitly destroys each constructed
Sharp stream in `finally`, including failed metadata/policy/decode paths. Five
new real-decoder lifecycle tests pass (four failed before the fix), and all
three 4 MP fixtures retain their exact canonical sizes/hashes. A bounded Windows
comparison observed a lower peak with explicit cleanup (293.6 MB vs 326.0 MB);
this is not proof of Linux allocator behavior or whole-host memory safety.
No encoding quality, pixel or file cap changed. Linux comparison and actual
Render retesting remain required before claiming the memory failure fixed.

### Linux allocator comparison (Sep 30, 01:21 CDT)

Private manual workflow run `36677688324`, job `109766146624`, on commit
`6679bbb` reproduced the memory failure with the current decoder (including
explicit cleanup): the default glibc allocator was OOM-killed, exit 137, on
the second image. With `MALLOC_ARENA_MAX=2` present before Node startup, all six
decodes passed with identical canonical SHA256 hashes and zero outbound
attempts. The candidate exited 0, OOMKilled=false, with cgroup peak 447,868,928
bytes out of 536,870,912. Process peak RSS was 491,442,176 bytes.

Both variants used Node 22.23.3, glibc 2.36, Sharp 0.35.5/libvips 8.18.7,
three exact hosted originals cycled twice, 128 MiB of touched synthetic resident
overhead, no container network or provider credentials, and a real 512 MiB
memory limit with no swap. This is decoder-allocation evidence, not a substitute
for full hosted uploads/scans/exports. The Render start command was saved as
`MALLOC_ARENA_MAX=2 APP_URL="$RENDER_EXTERNAL_URL" npm run start:cloud`; no plan,
caps, DNS, credentials or PC hosting changed. Deployment and hosted retesting
are the next step; no invitations are authorized yet.

### Allocator deployment and real HTTP refusal recheck

Render deployment `dep-dauam6ek1f9s73b2if6g` of `979df42` became live at
01:25:52 CDT. The startup log records the prefixed allocator command; the
new Linux configuration guard passed, and cgroup memory at startup was
93,278,208 bytes (512 MiB maximum). The deployed revision includes stream
cleanup and the bounded HTTP-refusal fix. A real unauthenticated POST containing
9,437,185 bytes, sent as a whole body with `Connection: close`, now returns
413 plus the expected refusal body and `Cache-Control: no-store` in 658 ms,
instead of the old 502. Subsequent `/api/health` returned 200 / `ok:true` at
06:26:57 UTC. The synthetic runtime rehearsal remains 17/17, zero outbound
connections, separate port 3999 stopped afterward. Repeated actual image
uploads remain pending until the existing hourly allowance naturally frees;
the cloud is deliberately left idle in that interval for a cold-start check.

The known interrupted-image reservation was then reconciled under the existing
advisory lock and a row lock, with fresh complete S3 inventory and all clean
DB references checked inside the transaction. All seven objects still match
43,081,188 stored bytes; no canonical scan had been charged and the old process
was replaced. Only that row's state and settled_at changed to released. Its
ID, owner, 7,182,348-byte value and exact creation timestamp (including
microseconds) remain intact, as do all 15 owner attempt-history rows and the
270 MiB scan charge. No file, quota counter or limit was removed/changed.
There are zero held rows and the backup reference reconciliation now passes.
Two earlier conditional attempts rolled back with zero matching UPDATE rows:
the driver coerced a timestamptz parameter through millisecond-precision Date.
The successful guarded comparison used the exact captured timestamp text.
The one-off helper was removed afterward; no repair endpoint was added.

A fresh run of the existing encrypted-backup workflow (`36679045358`, revision
`979df42`) then completed successfully in 1m23s, with one encrypted artifact.
This confirms the reconciled state no longer blocks the backup workflow.
The offline download verifier uses only an explicitly supplied browser-download
path and the existing fixture manifest: five original payload hashes, eleven
bounded/CRC-checked entries, real numbered media UUID paths, empty-caption hash
and exact 32 MiB accounting. Historical text hashes from the pre-CRLF manifest
are explicitly not claimed verified. Thirteen focused tests pass; actual
hosted package downloads still await the remaining normal image uploads.

Idle observation: no app requests were sent between 06:26:57 and 06:47:32 UTC.
The subsequent private-access page returned 200 in 362 ms; Render logs show
no new startup after 06:25:49. Thus the service did not demonstrably sleep,
and this is recorded as an inconclusive cold-start check, not a pass or failure.

### Hosted repeat-image verification (Sep 30, 02:09 CDT)

On the unchanged Render instance `4bfnf` / revision `979df42`, three successive
maximum-pixel originals completed their original and canonical scans and stored
successfully at 06:56:35, 07:01:24 and 07:02:15 UTC. They were image 3 on the
export-boundary listing and images 1/2 on the disposable `Cloud image memory
check` listing (`74d10010-e807-4b14-b066-fdbb02433fa8`). There was no process
restart between them. The largest actual cgroup peak was 437,596,160 bytes
(about 417.3 MiB), below 536,870,912; all three canonical sizes and SHA256 hashes
were independently verified by bounded read-only storage reads. This is real
hosted repeated-upload evidence, not just the earlier decoder benchmark.

The smaller fourth export-fixture image then returned a generic unexpected
server response at 07:02:55 and on one controlled retry at 07:06:17 UTC. Neither
attempt created a reservation, image row, object or scan charge, and Render
reported no new restart. Do not call this a successful upload or assume it was
another OOM. Exact-boundary hosted export remains untested until this request
failure is understood and the fourth image is safely stored.

The independent 2049x2048 harmless PNG correctly returned the 4-megapixel policy
refusal. Its 60,443-byte reservation `fe9b5e22-7e4a-491e-bad6-9a1f2ea549b4`
was created at 07:07:58.781 UTC and released at 07:08:02.380, with no media/build
link. Exactly one original scan was charged (3 MiB), no canonical scan. The
07:09:50 read-only audit confirms all 10 objects/reference rows/stored ledger
entries match 63,426,540 bytes, zero drift and zero held reservations; total
scan allowance used is 399 MiB. No attempt history or limit was reset.

The admission-diagnostic build `ec324bb` deployed successfully as
`dep-daubdj6k1f9s73b5h5p0` at 07:15:55 UTC (instance `66sbg`). It adds bounded
numeric-status/method/body-length logging only, with no request URLs, bodies,
credentials or file names. Nineteen focused tests, lint and typecheck pass.
The same fourth image still returned the generic browser error, with no
corresponding admission-start/refusal record in the refreshed app logs.
As a control, archiving the completed repeated-image fixture through its
normal owner form at 07:17:49 logged an accepted 1,470-byte POST and a 653 ms
completion. This supports an upstream/request-transport hypothesis but does
not establish an HTTP status or root cause. No fourth-image retry is counted
as a successful test. The two-image memory-check listing is now archived;
its files were not deleted. A browser response-metadata diagnostic is being
prepared to distinguish an upstream refusal from an application response.

### Concrete remaining upload blocker (Sep 30, 02:26 CDT)

Revision `76b9cc5` deployed as `dep-daubi1tg1s2s73c9c8rg`, live at 07:25:34 UTC,
instance `xrln7`. Its cloud-only client observer preserves the exact original
fetch arguments, promise and response; it never reads/clones response bodies,
retries, changes transport or logs credentials. Six regression tests, lint,
typecheck and an isolated cloud build (`.next-check`) pass. Normal local preview
was not stopped or rebuilt in place.

The unchanged image-4 upload returned a measured **403 / text/html** at
**2026-09-30T07:26:50.196Z**. This is not the application's structured image
policy refusal. Earlier app admission/completion controls work while these
requests have no corresponding admission record. An upstream security or proxy
refusal is therefore the leading hypothesis; its exact issuer/rule remains
unproven. Stop resubmitting this file or routing around the refusal. No IP,
domain, encoding, credential, client or security-control workaround was used.

Render documents its automatic Cloudflare-backed protection and lists
`support@render.com` for questions: https://render.com/docs/ddos-protection .
The next legitimate step is provider investigation using the service ID, exact
UTC time, POST path, 5,090,772-byte synthetic WebP size and 403/text-html result,
without secrets, cookies or the image itself. At this checkpoint no provider
message had been sent; see the later support escalation below.
The exact-32-MiB hosted export and one-byte-over check remain blocked, not passed.
Hosted malware rejection remains unverified because the earlier local antivirus
block must not be bypassed; idle cold-start remains inconclusive. No Discord
invitation, paid upgrade, DNS/tunnel change or PC hosting was introduced.

Final read-only audit at 07:28:51.515 UTC: still 10 matching objects/stored
reservations, 63,426,540 bytes, zero drift and zero held rows; scan usage remains
399 MiB. No reservation exists after the over-pixel attempt at 07:07:58.781.
The export fixture remains alpha with one build/three images for the unresolved
check; the repeated-image fixture is abandoned with its two clean images intact.

### Upload refusal correlation and support escalation (Sep 30, 04:12 CDT)

The existing Render dashboard support conversation was escalated to a human
engineer. No human response or confirmed cause has been received yet.

Diagnostic-only revision `decb03c` deployed as `dep-daud1vu0tbcc73ev79c0`, live
at 09:07:40 UTC (instance `cv6cx`). Failed responses now record bounded validated
CF-Ray, response type, redirect status and final same-origin status. Request
arguments, promise/response identity and transport remain untouched; no bodies,
URLs, cookies or secrets are read or recorded. Ten focused tests, typecheck,
lint and isolated cloud production build pass. This is not an upload fix.

One unchanged normal-form reproduction of image 4 (5,090,772 bytes) at
**2026-09-30T09:08:49.008Z** returned **403 / text/html**, `redirected=false`,
`responseType=basic`, `finalSameOrigin=true`, and CF-Ray
`a43215a61cf7f0ad-DFW`. The actual service Application logs, Last hour view,
included this timestamp but showed no corresponding upload admission record.
CF-Ray is a correlation identifier, not proof Cloudflare generated the response.

The timestamp, identifier, path, size and bounded response metadata were sent
and visibly confirmed in the existing Render support conversation. No file,
cookie, credential, HAR or response body was sent. No further upload retry or
security workaround was attempted. The previous 07:28 storage audit was not
rerun after this reproduction, so it is not presented as a current audit.

Full upload readiness remains blocked pending identification/resolution of the
403 and completion of the outstanding hosted checks above. Free plan, malware
scanning, access controls, caps, website DNS and local preview are unchanged.

### Sep 30 midday follow-up: recovery and obsolete Railway cleanup

The support conversation still contained no human response about eight hours
after escalation. A second independent code review found no justified app-side
configuration correction for the observed 403. No blocked upload was retried.

At 17:03:09 UTC a normal reload of the existing QA account page showed Render's
service-waking interstitial. Instance `gd8xp` started at 17:03:42 and listened
at 17:03:49, with RSS 131,919,872 and cgroup current/peak 92,225,536 bytes.
By the next observation at 17:04:27 the account page was restored with the QA
session intact. This confirms an actual idle cold start, with recovery observed
within 78 seconds; it does not test a restart during an upload.

A narrow client wrapper now maps unexpected screenshot-action rejection to an
inline uncertainty message, keeping the page/gallery mounted. It preserves the
original server action, state and FormData, makes one call, and rethrows Next
navigation/control-flow errors using its documented guard. Normal server success
and validation responses remain unchanged. It requires client hydration and does
not promise to preserve the selected file after React resets a completed form.
This is recovery behavior, not a fix for the provider-correlated 403. Four new
focused tests pass; all 351 unit tests, typecheck, full lint and isolated cloud
production build pass. Live failed-upload recovery has not been re-exercised.

The owner's Railway crash emails exposed obsolete GitHub auto-deploy connections
in project `adventurous-forgiveness` (`67b668c0-be5f-43ca-b0eb-d9635cdd5d85`).
With explicit owner approval, auto-deploy was disabled for both `clamav` and
`beta-mod-hub`, and their current deployments were stopped using Remove Deployment:
`2f2e0b44-bb33-4fd7-a6d1-5a5ff7b2a57c` and
`540e7842-a6ad-4aba-b3fe-55eac7926aeb`, respectively. Both show REMOVED; ClamAV
is offline and the app canvas shows its last historical build failure, no longer
Online. The project, service configuration, source references and any persistent
volumes were not deleted or changed. No Railway deployment should be restarted.
These old services are not part of Render/Transloadit's runtime and do not explain
the current Render upload refusal. The dashboard showed 23 days / $4.74 trial
allowance remaining; no payment-method or billing audit is claimed.

Recovery revision `3ea85f5` is live on Render deployment
`dep-dauk5qe7bikc73f2fra0` at 17:15:21 UTC. Instance `m457c` listened at
17:15:16, with startup RSS 139,026,432 and cgroup peak 96,018,432 bytes.
The service passed its unchanged cloud-runtime guards; the scanner remains
Transloadit and final storage remains private Supabase S3. The old `R2Store`
helper names are shared S3-compatible implementation names, not a cloud runtime
fallback to R2 or Railway. No blocked-file retry was performed for this release.

A 17:13:41 UTC read-only check explicitly verified the pilot database target
differs from both local-dev and production-main hosts. It found 10 stored ledger
rows / 63,426,540 bytes, 9 released rows, zero held rows and one approved uploader.
The latest reservation is still 07:07:58.781 UTC, confirming no reservation was
created by the later refused request. No uploads-enabled override row exists
(the documented default is enabled). This was a database check, not a fresh
object-storage reconciliation. No database changes or quota resets were made.

### Sep 30 private-beta preparation and approved fixture cleanup

The owner revised the release scope to a small invited Discord beta on the
existing Render Free pilot, accepting ordinary beta issues rather than another
provider migration or exhaustive synthetic test campaign. The unresolved image
403 and unverified hosted rejection/boundary/interruption cases remain recorded
follow-ups, not passed tests. Scanning, permissions, budgets and caps are intact.

A 17:36:29 UTC read-only DB/S3 reconciliation found 12 stored objects totaling
71,890,262 bytes, no drift or held rows, one approved uploader, and 432 estimated
MiB charged for monthly scans. The owner's recent successful 8 MiB build and
75,114-byte image uploads settled in approximately 51 and 8 seconds respectively.

Changes `d50a516` and `15b4539` add an honest elapsed upload indicator (no fake
percent or invented scan stage), retain form text after unconfirmed responses,
clarify file-uploader approval, use provider-neutral malware-scan labels, and
permit the owner to delete an archived mod without reopening it for edits.
Render deployment `dep-daukoabtqb8s73bongc0` of `15b4539` is confirmed Live.
Successful requirement writes now invalidate their mod page (`a3f6b53`) after a
real add saved but the same-page redirect displayed stale data. This last fix
has passed tests/build but is not yet claimed deployed in this checkpoint.
All 368 unit tests, full lint, typecheck and isolated cloud build pass.

After explicit confirmation, exactly these five fake cloud listings were deleted:

- `dcd70c2f-04cc-4d5a-baa6-2f778e5887cd`: Cloud validation — temporary test
- `1357385f-8a34-4aa4-ae01-8a153d3bd449`: Cloud rejection checks — temporary system test
- `60d7d4ed-ce05-4db4-b99e-631e667bd1eb`: Cloud export boundary fixture
- `74d10010-e807-4b14-b066-fdbb02433fa8`: Cloud image memory check
- `bc352eb2-b9fb-4594-8227-1bba0cfc2fc3`: .... (Synthetic QA)

Native Chrome confirmation controls stalled browser automation. A reviewed,
one-off operator cleanup therefore performed a dry run, then an explicit execute
against hard-pinned isolated pilot targets. It checked exact UUID/title/game/owner,
foreign references and complete DB/S3 reconciliation, locked the targeted mod
rows, reused the bounded S3 removal driver, then followed the app's FK/attachment
reservation cleanup order. It removed 3 builds, 8 images, 1 private attachment,
and 1 test report: 12 objects / 71,890,262 bytes. After commit, stored and held
reservations were zero with zero drift. Both accounts, all 9 released attempt
rows, uploader approvals/settings, and the only untargeted mod were unchanged.
The temporary cleanup script was removed. No local files were deleted. These
live deletions have no in-app undo; retained backups are a separate recovery path.

The real Start NG page is now `8efa77b6-15b1-424f-8c09-9ebc8c9faefc`, owned by
the existing Beta Mods account, with its existing beta description and four
requirements. Browse visibly shows only this listing. Its original local ZIP
is unchanged (3,217,451 bytes; 3,837,522 expanded bytes in five entries). The
existing cover is 1920x1080 and fits the image cap. Neither is claimed uploaded:
Chrome's native file-picker controls stalled, and the last read-only check found
zero Start NG builds and zero pending reservations. The owner was asked only to
cancel a stuck file-selection window so normal authenticated uploading can resume.
No session was minted, upload path bypassed, antivirus disabled or scan skipped.
