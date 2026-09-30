# Contributing to Beta Mods

Help make mod testing useful and approachable. You can contribute code, report a bug, suggest a workflow, improve accessibility, edit documentation, or test a proposed change. You do not need access to the live service to participate.

## Discuss and submit a change

1. Search existing Issues and pull requests. For a substantial feature or architecture change, open an Issue first and describe the user problem, not just the implementation.
2. Fork the repository and create a focused branch from its current `main`.
3. Make a small, reviewable change. Preserve unrelated work and add tests for changed behavior.
4. Run the applicable checks below. Record failures or checks you could not run honestly.
5. Open a pull request explaining the problem, solution, verification, and any migration or operational impact. Include before and after screenshots for visible UI changes, using synthetic data.
6. Respond to review. A maintainer merges only after the required checks and review are complete.

Do not push directly to the upstream default branch or deploy a pull request to the live pilot. Pull requests do not receive production secrets, databases, uploaded files, backup artifacts, or administrator privileges. Maintainers review deployment separately from code review.

## Basic setup and checks

Use Node.js 22, npm, and a fresh checkout. Run `npm ci`, then `npm run dev -- --hostname 127.0.0.1`. With no database configured, public empty states are available but database-backed actions are not.

Run these checks without private environment files or inherited service credentials:

```sh
node node_modules/next/dist/bin/next typegen
npm run typecheck
npm run lint
npm test
npm run build
```

On PowerShell, use `npm.cmd` instead of `npm` when the script shim is blocked. If a preview is already using `.next`, the existing `BETAMODS_BUILD_CHECK=1` environment setting builds into `.next-check`; otherwise use a separate clean checkout for validation.

The first command generates Next.js route types for a fresh checkout. The default unit suite and a successful build do not establish that a hosted upload, email delivery, or database migration works. The contributor workflow also builds the bounded cloud profile without service credentials; this is a build check, not a deployment test.

## Database backed development

Use a disposable PostgreSQL database containing only your development data. PostgreSQL 18 matches the hosted pilot. Local PostgreSQL is sufficient; a production or maintainer-owned cloud account is not required.

1. Create a new empty database and a development-only database user.
2. Inspect `schema.sql`, then apply it once to that empty database using your PostgreSQL client. It contains the current schema, including constraints and indexes, and is not a reset script to run over existing data.
3. Copy `env.example` to a gitignored `.env.local`. Set `DATABASE_URL` to your own disposable database URL and set a new local `SESSION_SECRET`. Never use a live service's secret.
4. For local-only work, use `APP_URL=http://127.0.0.1:3000`, `STORAGE_DRIVER=local`, and `AUTH_MAIL_MODE=preview`. Leave `CLOUD_PILOT` off and production provider credentials unset.
5. Start the app on loopback and create development accounts through the normal UI. See [Account setup](ACCOUNT-SETUP.md) for local email preview and administrator setup. Do not expose preview mail or development authentication settings publicly.

Generate a local session secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save the result only in your private local configuration. Do not paste it into a report or commit it.

For an existing development database, inspect the SQL under `db/migrations` and apply the applicable changes with your PostgreSQL client after backing up your data. Do not repeatedly apply `schema.sql` to a populated database. The deployment-specific migration runner is not part of this community snapshot. Migration proposals should include a rehearsal against a disposable database, not a request for production access.

## Test uploads locally

Uploads intentionally refuse to work without a real scanner. Install ClamAV for your operating system, update its signatures with `freshclam`, and run `clamd` on loopback. Do not expose its TCP port to your network or the internet.

In `.env.local`, configure the app and wrapper together:

```dotenv
SCAN_SERVER_HOST=127.0.0.1
SCAN_SERVER_PORT=3311
CLAMD_HOST=127.0.0.1
CLAMD_PORT=3310
SCAN_API_KEY=<your-local-scanner-secret>
SCAN_DRIVER=clamav
SCAN_ENDPOINT=http://127.0.0.1:3311
MALWARE_SCAN_API_KEY=<the-same-local-scanner-secret>
```

Then start the wrapper in another terminal:

```sh
node --env-file=.env.local scripts/scan-server.mjs
```

Node loads the file explicitly for this command. Keep `SCAN_SERVER_HOST=127.0.0.1` so the wrapper is not exposed to the LAN. No container is needed.

Restart the app after changing configuration. A successful `GET http://127.0.0.1:3311/healthz` means the wrapper can reach `clamd`, not that an upload has completed. Test with a tiny archive you created yourself and inspect both the stored file and the application's result. Do not disable security software to run a fixture, use real malware, or bypass the scan to make a test pass.

## Tests included in this snapshot

`npm test` runs the community unit suite under `tests`. The public CI runs these tests, lint, route type generation, typecheck, and builds without database or provider credentials.

Deployment-specific integration tests, end-to-end scripts, backup workflows, and operator rehearsal tools remain outside this repository. They are not available through public npm scripts, and passing contributor checks does not mean they ran.

An isolated local integration harness is a useful contribution. Propose its design first: it should create and clean up its own disposable database and fixtures, use no live service credentials, never change shared upload controls, and report skipped checks honestly. Until such a harness is added, describe any manual local account, upload, or migration checks in your pull request, including the environment and cleanup performed. Do not use the hosted pilot as a test backend.

## Code and review expectations

- Read `AGENTS.md` and the relevant product spec before making changes. For Next.js behavior, use the version-matched documentation shipped with the installed dependency.
- Keep schema definitions and SQL consistent. Describe migration, rollback, and data-preservation consequences in the pull request.
- Enforce permissions on the server. Hiding a button is not authorization.
- Preserve quarantine, scan, and final-storage boundaries. Missing scans, unknown quota state, and provider failures must not publish files.
- Treat pilot limits and provider billing controls as safety boundaries. Do not raise them as an incidental fix.
- Use existing visual patterns, semantic HTML, keyboard access, and field-level error associations. Test narrow viewports and empty states.
- Do not automate the Nexus website. New Nexus API work needs a verified API contract and must not claim unfinished OAuth support works.
- Keep dependencies and generated assets purposeful. Explain their licensing and provenance. Do not include real mod binaries or private screenshots as test fixtures.
- Review your diff and staged files before submission. Do not commit environment files, access codes, mail previews, backups, database dumps, or generated user content.

## Community conduct and licensing

Discuss the work respectfully and explain disagreements with evidence. Do not harass contributors, reveal personal information, or use issue threads to pursue someone. Contact `admin.betamods@gmail.com` privately about conduct concerns or use the process in [Security](SECURITY.md) for vulnerabilities.

Contribute only material you have the right to share. Check the repository's `LICENSE` before contributing or reusing code; license selection must be finalized before the project represents itself as licensed open source. Authors' uploaded mods and third-party dependencies are not relicensed by a website contribution.
