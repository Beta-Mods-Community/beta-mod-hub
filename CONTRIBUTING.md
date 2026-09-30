# Contributing to Beta Mods

You can help with bug reports, design, accessibility, documentation, testing, or code. Anyone can open an Issue, fork the repository, and submit a pull request.

Use a fork of [Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub). No invitation is needed. Production services and backups stay private; only the owner merges changes or deploys the site.

## Discuss and submit a change

1. Discuss larger changes in Discord or an Issue before building them. Explain the problem you want to solve.
2. Fork `Beta-Mods-Community/beta-mod-hub`, clone your fork, and create a branch from `main` for your change.
3. Keep the change focused, leave unrelated work alone, and add tests for changed behavior.
4. Run the relevant checks below. Note anything that failed or could not run.
5. Open a pull request with a short explanation, test results, and any database or deployment changes. For UI work, include before and after screenshots with test data.
6. Respond to review. The owner decides when the change can be merged and deployed.

Do not push directly to upstream `main` or run deployment or backup workflows. Use your own local test environment, not the live pilot.

## Basic setup and checks

Use Node.js 22 and a fresh checkout. `.nvmrc` pins the major version; run `nvm use` if you use nvm, or select Node 22 with your preferred version manager. Run `npm ci`, then `npm run dev -- --hostname 127.0.0.1`. Without a database, you can work on the layout and empty states but cannot use account or upload actions.

Run these checks without private environment files or inherited service credentials:

```sh
node node_modules/next/dist/bin/next typegen
npm run typecheck
npm run lint
npm test
npm run build
```

On PowerShell, use `npm.cmd` instead of `npm` when the script shim is blocked. If a preview is already using `.next`, the existing `BETAMODS_BUILD_CHECK=1` environment setting builds into `.next-check`; otherwise use a separate clean checkout for validation.

The first command generates Next.js route types. The CI workflow also builds the cloud profile without service credentials. These checks do not test live uploads, email delivery, or database migrations.

The scoped `esbuild` override in `package.json` keeps Drizzle Kit's older loader on a patched transform dependency. Keep it until that dependency chain is updated; validate changes with a clean install, dependency audit, and offline `drizzle-kit export` before removing it.

## How pull requests are tested

Fork CI needs owner review and approval before execution. The owner reviews the diff first, including dependencies, scripts, and workflow changes. Checks must run without production secrets, write tokens, self-hosted runners, or access to live services. A pull request does not create a Render preview deployment.

The merge policy requires both `Validate (default)` and `Validate (cloud)` to pass, along with owner code review. Record the tested commit and results on the pull request. See [Repository setup](REPOSITORY-SETUP.md) for branch protection and CI settings.

Do not merge into `main` just to trigger checks. Post-merge checks are not a substitute for testing the pull request. CI cannot approve or merge its own changes. Only the owner decides when a reviewed change is merged and deployed.

## Development with a database

Use a disposable PostgreSQL database with your own test data. PostgreSQL 18 matches the pilot. You do not need a maintainer's database or cloud account.

1. Create a new empty database and a development-only database user.
2. Inspect `schema.sql`, then apply it once to that empty database using your PostgreSQL client. Stop if any statement fails. It contains the current schema, including constraints and indexes, and is not a reset script to run over existing data.
3. Copy `env.example` to a gitignored `.env.local`. Set `DATABASE_URL` to your own disposable database URL and set a new local `SESSION_SECRET`. Never use a live service's secret.
4. For local-only work, use `APP_URL=http://127.0.0.1:3000`, `STORAGE_DRIVER=local`, and `AUTH_MAIL_MODE=preview`. Leave `CLOUD_PILOT` off and production provider credentials unset.
5. Start the app on loopback and create development accounts through the normal UI. See [Account setup](ACCOUNT-SETUP.md) for local email preview and administrator setup. Do not expose preview mail or development authentication settings publicly.

Generate a local session secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Save the result only in your private local configuration. Do not paste it into a report or commit it.

For an existing development database, back it up and review the relevant SQL in `db/migrations`. Do not apply `schema.sql` over populated tables. `scripts/apply-migrations.mjs` is a maintainer tool: it reads `.env.local` and requires a distinct `.env.production` comparison endpoint. If `.env.cloud.local` supplies a database URL, that endpoint is also excluded. These checks compare hosts, including pooled/direct variants, not just database names. The script does not initialize an empty database. Do not invent a comparison value or request production credentials to get past a check. Use the fresh local setup above instead. Test migration changes against disposable data before submitting them.

## Test uploads locally

Uploads need a real scanner. Install ClamAV, update its signatures with `freshclam`, and run `clamd` on loopback. Do not expose its TCP port to your network or the internet.

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

Restart the app after changing settings. `GET http://127.0.0.1:3311/healthz` checks that the wrapper can reach `clamd`; it does not test an upload. Upload a tiny archive you made yourself and check the stored file and app result. Do not disable security software, use real malware, or bypass scanning to make a test pass.

## Integration and operational checks

These commands have different requirements:

| Command | Scope |
| --- | --- |
| `npm test` | Unit and policy tests, no live services required |
| `npm run test:integration` | Database-backed tests, including writes and fixture cleanup |
| `npm run e2e` | Running app, real scanner, storage driver, and upload controls |
| `npm run e2e:profile` | Profile workflow against a running development app |
| `npm run e2e:feedback` | Feedback workflow and fixtures against a development database |
| `node scripts/test-auth-flow.mjs` | Writes and removes a fixture account; tests hashing and signed tokens, not email delivery or the browser login flow |
| `npm run smoke:prod` | Operator smoke checks; review its target and options before any use |

Contributor CI runs unit tests, lint, route type generation, typecheck, and builds without service credentials. Database, end-to-end, provider, backup, and restore tests run separately. Never give a contributor pull request production secrets.

Read each script before running it. These are maintainer-operated suites, not part of the fresh-checkout commands above. Several need `.env.local`, a separate production-comparison endpoint, and seeded demo records. The shared database guard also excludes the cloud endpoint when `.env.cloud.local` contains one. The upload suite needs a running app and scanner and can temporarily change upload controls. Use only an approved isolated environment with disposable data and matching storage settings. If a suite skips or refuses to run, report it rather than weakening the guard. [Scripts](scripts/README.md) distinguishes offline checks from tools that connect to services.

Report which checks ran, the environment and storage driver, any failures or skips, and whether test data was cleaned up.

## Code and review expectations

- Follow `.editorconfig` and `.gitattributes`: UTF-8, two-space indentation, and LF line endings except Windows `.cmd`/`.bat` files, which use CRLF. Preserve Markdown hard breaks and avoid unrelated formatting changes.
- Read the relevant product spec section before making changes. For Next.js behavior, use the version-matched documentation shipped with the installed dependency.
- Keep schema definitions and SQL consistent. Describe migration, rollback, and data-preservation consequences in the pull request.
- Enforce permissions on the server. Hiding a button is not authorization.
- Preserve quarantine, scan, and final-storage boundaries. Missing scans, unknown quota state, and provider failures must not publish files.
- Do not raise upload, storage, or billing limits as a shortcut around a bug.
- Use existing visual patterns, semantic HTML, keyboard access, and field-level error associations. Test narrow viewports and empty states.
- Do not automate the Nexus website. New Nexus API work needs a verified API contract and must not claim unfinished OAuth support works.
- Explain why new dependencies or assets are needed and record their source and license. Do not use real mod binaries or private screenshots as test fixtures.
- Review your diff and staged files before submission. Do not commit environment files, access codes, mail previews, backups, database dumps, or generated user content.

## Community conduct and licensing

Keep criticism about the work, not the person. Do not harass contributors or share personal information. Send conduct concerns to `admin.betamods@gmail.com`; follow [Security](SECURITY.md) for vulnerabilities.

No open-source license has been selected. GitHub forks and pull requests are welcome. Submit only material you have the right to contribute for use in Beta Mods, and explain any restrictions before submitting it. This guide does not create a separate contributor license agreement, transfer copyright, or grant a general open-source license. Uploaded mods and dependencies keep their own licenses and permissions.
