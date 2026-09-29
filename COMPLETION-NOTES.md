# Local product-completion checkpoint — 2026-09-28

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
