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
