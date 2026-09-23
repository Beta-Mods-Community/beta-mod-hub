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
| `npx drizzle-kit generate` | Generate a migration from `db/schema.ts` (needs `DATABASE_URL`) |
| `npx drizzle-kit push` | Push schema to the database |

Windows note: call npm as `npm.cmd` inside a shell — PowerShell's execution policy blocks the `.ps1` shim.

`db/schema.ts` mirrors `schema.sql` — keep them in sync. `lib/db.ts` returns a null `db` until `DATABASE_URL` is set, so the app boots before the Neon project exists; guard queries on `db` being non-null.

Uploads always run **quarantine → scan → serve** — nothing is stored or served without a clean scan, and there's no dev exception. If `SCAN_ENDPOINT` isn't set, uploads refuse outright. Local dev: the app expects `SCAN_ENDPOINT` to point at `scripts/scan-server.mjs`, which talks to a local `clamd` over TCP (see the script's header for env vars). On this dev machine (ClamAV 1.5.4 extracted to `C:\Users\chast\ClamAV`):

- Configs: `C:\Users\chast\ClamAV\clamd.conf` + `freshclam.conf` (quarantine limits raised to the app's 512 MB cap).
- One-time: run `freshclam.exe --config-file=...\freshclam.conf` to download the virus DB into `database\`.
- Start the daemon: `Start-Process ...\clamd.exe -ArgumentList '--config-file=...\clamd.conf' -WindowStyle Hidden` (listens on 127.0.0.1:3310). If the very first start logs `ERROR: Malformed database`, it's Windows Defender still holding the just-downloaded DB files — just restart clamd.
- Then `node scripts/scan-server.mjs` (listens on :3311) and set `SCAN_ENDPOINT=http://127.0.0.1:3311` in `.env.local`.
- Full loop check: `npm run e2e` (`scripts/e2e-upload.mjs`) — signs in as the demo owner with a minted session cookie, uploads a benign build then an EICAR build over the real no-JS form protocol, and asserts both the sanitize/serve path and the block path.

The deployed Oracle VM runs the same scan wrapper against the `deploy/clamav/` ClamAV container as `SCAN_ENDPOINT`.

## Working style

- Build in the phase order the spec lays out (Build order, phases 1-4). Don't start Nexus integration before the core loop (BetaMod CRUD, Build uploads, feedback) actually works.
- Small, logical commits — one feature or fix per commit, not one giant commit per phase.
- Before considering any change done: it builds, lints clean, and (once tests exist) passes tests. Add tests alongside the code that needs them, not as a separate pass at the end.
- Never commit real secrets. `.env.example` documents what's needed; actual values stay in a local, gitignored `.env.local`.
- If something in the spec turns out to be wrong once you're working against Nexus's live API (rate limits, field names, response shapes), fix the code to match reality and leave a short note in the spec's relevant section rather than silently diverging from it.

## Hosting decision (updated with the owner)

Production: **Oracle Cloud Always Free** Ampere VM running Docker Compose
(Next.js + ClamAV + Caddy), **Neon Free** Postgres, and a persistent Docker
volume for uploads. Cloudflare provides DNS/Registrar only. This keeps the
runtime on hard free-tier limits instead of a usage-billed hosting plan.
Local dev still uses `STORAGE_DRIVER=local`. See `DEPLOY.md`.

**Domain:** `betamods.com` — registered via Cloudflare Registrar (same account as the series site; separate zone). Parked until deploy; point at the Oracle VM when the app is healthy.

## Hard constraints (from the spec, repeated here because they're easy to accidentally violate mid-build)

- No browser automation against nexusmods.com. API only.
- The Upload API pushes files to a mod page that already exists — never write code that assumes it can create a new Nexus page.
- Every uploaded file gets malware-scanned before it's stored or served. No exceptions during development, either — build this in from phase 1, not bolted on later. The upload pipeline is always quarantine → scan → serve; never serve directly from the upload path.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
