# Agent Instructions

Read `beta-mod-hub-spec.md` first — that's the product/technical spec. This file is operational: how to work in this repo, not what to build.

## Setup

Scaffolded with Next.js 16 (App Router, TypeScript, Tailwind v4, ESLint flat config) + Drizzle ORM (`postgres` driver). Read the version-matched docs in `node_modules/next/dist/docs/` before writing Next-specific code — Next 16 has breaking changes vs older training data.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:3000 (Turbopack, hot reload) |
| `npm run build` | Production build (Turbopack) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (Next 16 removed `next lint` — run eslint directly) |
| `npm run typecheck` | `tsc --noEmit` — the type gate to run before hand-offs |
| `npm test` | Unit tests (`tests/*.test.ts`) |
| `npm run test:integration` | Integration tests (`tests/integration/*`) — hits the real dev Neon |
| `npm run e2e` | Full upload-pipeline test against a running dev server + scanner |
| `npx drizzle-kit generate` | Generate a migration from `db/schema.ts` (needs `DATABASE_URL`) |
| `npx drizzle-kit push` | Push schema to the database |

Windows note: call npm as `npm.cmd` inside a shell — PowerShell's execution policy blocks the `.ps1` shim.

Tests run with `node --conditions=react-server` (see the `test` script) because `lib/storage.ts` and `lib/storage-r2.ts` import `server-only`, which otherwise throws outside a React Server Component graph. Integration tests are a separate script because this package is CommonJS-by-default and cannot transform top-level `await` in `.ts` test files — use `before()` plus dynamic `import()` instead.

`db/schema.ts` mirrors `schema.sql` — keep them in sync. `lib/db.ts` returns a null `db` until `DATABASE_URL` is set, so the app boots before the Neon project exists; guard queries on `db` being non-null.

Migrations: `db/migrations/*.sql` are hand-written and **idempotent** (IF NOT EXISTS everywhere), and `node scripts/apply-migrations.mjs` applies them. It refuses to run if `.env.local`'s `DATABASE_URL` is the same as `.env.production`'s, so the dev branch is the only thing it can touch. **Never point it at the production Neon branch.**

Uploads always run **quarantine → scan → serve** — nothing is stored or served without a clean scan, and there's no dev exception. If `SCAN_ENDPOINT` isn't set, uploads refuse outright. Local dev: the app expects `SCAN_ENDPOINT` to point at `scripts/scan-server.mjs`, which talks to a local `clamd` over TCP (see the script's header for env vars). On this dev machine (ClamAV 1.5.4 extracted to `C:\Users\chast\ClamAV`):

- Configs: `C:\Users\chast\ClamAV\clamd.conf` + `freshclam.conf` (quarantine limits raised to the app's 512 MB cap).
- One-time: run `freshclam.exe --config-file=...\freshclam.conf` to download the virus DB into `database\`.
- Start the daemon: `Start-Process ...\clamd.exe -ArgumentList '--config-file=...\clamd.conf' -WindowStyle Hidden` (listens on 127.0.0.1:3310). If the very first start logs `ERROR: Malformed database`, it's Windows Defender still holding the just-downloaded DB files — just restart clamd.
- Then `node scripts/scan-server.mjs` (listens on :3311) and set `SCAN_ENDPOINT=http://127.0.0.1:3311` in `.env.local`.
- Full loop check: `npm run e2e` (`scripts/e2e-upload.mjs`) — signs in as the demo owner with a minted session cookie, uploads a benign build then an EICAR build over the real no-JS form protocol, and asserts both the sanitize/serve path and the block path.

Both deployment targets run that same scan wrapper against the `deploy/clamav/` ClamAV container as `SCAN_ENDPOINT`. Home hosting runs the wrapper as its own Compose service (`deploy/home/scan-server/`) so it can be health-gated; the Oracle fallback starts it inside the app container.

## Working style

- Build in the phase order the spec lays out (Build order, phases 1-4). Don't start Nexus integration before the core loop (BetaMod CRUD, Build uploads, feedback) actually works.
- Small, logical commits — one feature or fix per commit, not one giant commit per phase.
- Before considering any change done: it builds, lints clean, and (once tests exist) passes tests. Add tests alongside the code that needs them, not as a separate pass at the end.
- Never commit real secrets. `.env.example` documents what's needed; actual values stay in a local, gitignored `.env.local`.
- If something in the spec turns out to be wrong once you're working against Nexus's live API (rate limits, field names, response shapes), fix the code to match reality and leave a short note in the spec's relevant section rather than silently diverging from it.

## Hosting decision

Production is a **small closed pilot, self-hosted on the owner's Windows PC**
behind a **Cloudflare Tunnel**, with **Neon Free** Postgres and **Cloudflare R2
Standard** holding the mod archives. See `DEPLOY-HOME.md` and
`compose.home.yml`.

The runtime is the PC, but the *files are not*. `compose.home.yml` hard-sets
`STORAGE_DRIVER=r2` and requires the four `STORAGE_*` credentials with `${VAR:?}`,
so a missing value stops the stack instead of quietly putting everyone's mods on
a laptop disk. The Docker `app-data` volume is quarantine scratch and is emptied
as each upload finishes: the sequence is quarantine → scan → PUT to R2 → delete
local copy, on success and on failure alike. Downloads 302 to a short-lived
presigned R2 GET URL, so archive bytes never cross the home connection.

**Quotas are enforced by the app, not by Cloudflare.** `lib/pilot.ts` holds the
numbers; `lib/storage-usage.ts` is a ledger in Postgres that reserves bytes
atomically under `pg_advisory_xact_lock` (transaction-scoped, so Neon's pooled
pgbouncer is fine) and **fails closed** — if usage can't be established, the
upload is refused, never allowed uncapped. Cloudflare budget alerts are
notifications that arrive after the fact; they are a tripwire, not a control.
R2's 10 GB-month free allowance is what the 8 GiB cap is protecting.

The R2 credential at runtime must be **bucket-scoped**, created after the
bucket. The broad `betamods-bootstrap` token in `.env.local` is a setup tool
for `scripts/setup-r2.mjs` and must never reach a running container.

Backups are a **Neon dump plus an R2 inventory** (`scripts/r2-inventory.mjs`) —
a *record* of the bucket cross-checked against the database, not a copy of the
archives. A mirror would double storage and push the pilot out of the free
allowance. The accepted consequence: R2 has no object versioning, so losing the
bucket means re-uploading. That is documented in `DEPLOY-HOME.md`, not
forgotten.

This replaced Oracle Cloud Always Free, which is **abandoned, not deleted**:
Ampere A1 capacity never became available and the tenancy is now locked out by
a lost MFA enrollment. `compose.oracle.yml`, `deploy/oracle/`, and `DEPLOY.md`
are kept intact as a fallback. The two targets use separate Compose project
names (`betamods` vs `betamods-home`) and separate env files
(`.env.production` vs `.env.home`); they share one Neon `main` branch, so only
one may be pointed at it at a time.

Local dev still uses `STORAGE_DRIVER=local` by default; set it to `r2` in
`.env.local` to exercise the presigned-download and R2-cleanup paths, and run
`npm run e2e` both ways. Windows-specific integration (auto-start after reboot,
sleep prevention, backup scheduling) lives in
`deploy/home/windows/Prepare-Host.ps1`.

**Domain:** `betamods.com` — registered via Cloudflare Registrar (same account as the series site; separate zone). Parked until deploy.

## Hard constraints (from the spec, repeated here because they're easy to accidentally violate mid-build)

## September 2026 completion work

Account recovery/verification, session revocation, UUID-based administrator
authorization, scanned media/gallery management, build-scoped feedback and
private attachments, search pagination, following, notifications and moderation
are implemented. New dev migrations are `0004`–`0006`; the production branch
has not been migrated. `schema.sql` and all three `db/*schema.ts` files describe
the schema. Integration suites run sequentially because storage tests exercise
shared pilot limits and the upload kill switch.

For this PC, use `Launch Beta Mods.cmd` / `Stop Beta Mods.cmd`; see
`LOCAL-PREVIEW.md`. The native local preview uses dev Neon + capped R2 + actual
ClamAV, all services loopback. Docker's Windows socket issue is not resolved by
this fallback. Public launch, SMTP inbox validation, production migration and
backup restore rehearsal remain separate gates. `AUTH_MAIL_MODE=preview` and
`AUTH_ALLOW_UNVERIFIED_LOCAL` are local-development aids, never production setup.

### Upload and integration constraints

- No browser automation against nexusmods.com. API only.
- The Upload API pushes files to a mod page that already exists — never write code that assumes it can create a new Nexus page.
- Every uploaded file gets malware-scanned before it's stored or served. No exceptions during development, either — build this in from phase 1, not bolted on later. The upload pipeline is always quarantine → scan → serve; never serve directly from the upload path.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
