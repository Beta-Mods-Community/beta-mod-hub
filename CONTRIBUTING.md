# Contributing to Beta Mods

Help make mod testing useful and approachable. You can report a bug, suggest a workflow, improve accessibility, edit documentation, or test a proposed change. Discord feedback does not require access to the code or live service operations.

This is the project's existing private repository and sole application codebase. Code access is intended for invited contributors, but new invitations remain on hold until operational access and backup exposure have been separated and verified. The workflow below is the agreed direction, not evidence that GitHub roles or branch protections are already configured.

## Discuss and submit a change

1. Discuss substantial changes in Discord, or search and open an Issue when you have authorized access. Describe the user problem, not just the implementation.
2. Once the owner has configured your access, clone the authorized repository and create a focused branch from its current `main`. Use a private fork only if the owner explicitly approves that arrangement. Do not create a public mirror or another independently maintained app copy.
3. Make a small, reviewable change. Preserve unrelated work and add tests for changed behavior.
4. Run the applicable checks below. Record failures or checks you could not run honestly.
5. Open a pull request explaining the problem, solution, verification, and any migration or operational impact. Include before and after screenshots for visible UI changes, using synthetic data.
6. Respond to review. The owner reviews the change and its checks before deciding whether to merge and deploy it.

Do not push directly to `main`, trigger deployment or backup workflows, or change cloud settings without explicit owner authorization. Repository access must not be treated as permission to use production credentials, data, or administrative controls. The credential-free contributor workflow does not inject service secrets, but that does not establish isolation from other workflow history or artifacts in the repository. That access review is still required.

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

The first command generates Next.js route types for a fresh checkout. The default unit suite and a successful build do not establish that a hosted upload, email delivery, or database migration works. The contributor workflow configuration also builds the bounded cloud profile without service credentials; this is a build check, not a deployment test or proof that required-check enforcement is enabled.

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

For an existing development database, inspect the SQL under `db/migrations` and apply the applicable changes after backing up your data. Do not repeatedly apply `schema.sql` to a populated database. The existing `scripts/apply-migrations.mjs` runner reads `.env.local` and requires a distinct `.env.production` comparison endpoint before applying migrations. It does not initialize an empty database. Do not invent a comparison value to bypass its guard or ask for production credentials; use the fresh local schema workflow above if your setup does not meet that guard. Migration proposals need a rehearsal against disposable data.

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

## Integration and operational checks

The complete tests and operational tools remain in this repository. They serve different purposes:

| Command | Scope |
| --- | --- |
| `npm test` | Unit and policy tests, no live services required |
| `npm run test:integration` | Database-backed tests, including writes and fixture cleanup |
| `npm run e2e` | Running app, real scanner, storage driver, and upload controls |
| `npm run e2e:profile` | Profile workflow against a running development app |
| `npm run e2e:feedback` | Feedback workflow and fixtures against a development database |
| `npm run smoke:prod` | Operator smoke checks; review its target and options before any use |

Only the credential-free unit, lint, route-type, typecheck, and build checks belong in contributor CI. Integration, end-to-end, provider probes, backup/restore, and live-service checks are separate and must not receive production secrets through a contributor pull request.

Read each target script before running it. Several suites depend on `.env.local`, a distinct production-comparison endpoint, and seeded demo records. The upload suite requires a running app and scanner and can temporarily change upload controls. Use only an owner-approved isolated environment, matching storage-driver settings, and disposable data. Some suites skip or refuse to run when prerequisites are missing. Do not weaken guards to get a green result.

In your pull request, identify checks run, the local environment and storage driver, skipped or failed checks, and whether fixtures were cleaned up. Do not report an unrun integration suite as passed or use the hosted pilot as your test backend. The existing operator runbooks are not permission for contributors to execute their production actions.

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

No open-source license has been adopted. Contribute only material you have the right to share, with the understanding that the owner may review and incorporate your proposed change into Beta Mods. Clarify any restrictions before submission. This document does not establish a separate contributor license agreement or transfer copyright ownership. It does not authorize public redistribution of the private repository. Authors' uploaded mods and third-party dependencies retain their own permissions and licenses.
