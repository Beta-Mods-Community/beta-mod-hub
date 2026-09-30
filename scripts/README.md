# Scripts

Start with the setup and checks in [Contributing](../CONTRIBUTING.md). This
directory also contains runtime code, database tools, and provider tests.
Do not run every script as a setup step. Some write data, start services,
upload files, use provider allowances, or restore backups.

Use Node.js 22. Check each script's header and arguments before running it;
not every script has a `--help` mode. Keep credentials and generated output
out of Git. A successful local check is not proof that a hosted integration
works.

## Runtime and shared helpers

| File | Purpose |
| --- | --- |
| `cloud-server.mjs` | Production entry point for `npm run start:cloud`; validates cloud configuration and starts Next.js with request and memory limits. |
| `cloud-http-handler.mjs`, `cloud-runtime-policy.mjs` | Cloud request admission, concurrency limits, and configuration validation. Imported by the launcher and tests. |
| `cloud-memory.mjs` | Process and Linux cgroup memory measurements used by the runtime and offline checks. |
| `scan-server.mjs` | HTTP wrapper for ClamAV. Requires a running `clamd` and defaults to loopback. For local use, run `node --env-file=.env.local scripts/scan-server.mjs`; see the scanner setup in Contributing. |
| `dev-database.mjs` | Reads private development configuration and rejects known production/cloud endpoints before mutating development tools connect. |
| `compose-ps.mjs` | Parser for Docker Compose status output, shared by smoke checks and unit tests. |
| `e2e-upload-state.mjs` | Captures and restores the upload controls changed by the development upload suite. |
| `local-preview-state.ps1` | Saved-process validation for the Windows preview launcher. |

## Local maintainer tools

These tools need an explicitly configured development environment. Database
writers using `readDevEnvironment` require `.env.local` and a distinct
`.env.production` endpoint. They also reject `.env.cloud.local`'s endpoint
when present. Do not fabricate settings to bypass that check. New contributors
can initialize their own empty database using [the contributor setup](../CONTRIBUTING.md#development-with-a-database).

| File | Effect |
| --- | --- |
| `check-db.mjs` | Connects to `.env.local` and reads the PostgreSQL version. No schema or record changes. |
| `apply-migrations.mjs` | Applies SQL migrations to the guarded development database. `--dry-run` still connects, but does not apply SQL. |
| `seed-demo.mjs` | Creates or updates persistent demo accounts, a hidden-from-Browse listing, builds, reports, and votes in development. |
| `test-auth-flow.mjs` | Inserts a unique fixture account, checks bcrypt and JWT primitives, then removes that account. Does not test email verification, delivery, or browser actions. |
| `e2e-upload.mjs` | Exercises real upload forms, scans, downloads, quotas, and approvals. Writes fixtures and temporarily changes upload controls; restores them afterward. |
| `e2e-profile.mjs` | Exercises profile editing through HTTP and restores the original fixture profile. |
| `e2e-feedback.mjs` | Creates and removes development users, reports, and storage objects while checking feedback permissions. |
| `bootstrap-admin.mjs` | Reads a selected account and previews an admin UUID setting. `--apply` writes the selected private environment file, not the database. |
| `local-preview.ps1`, `local-service.mjs` | Starts, stops, or checks the configured Windows/R2 preview. This uses private maintainer settings, not the generic `npm run dev` setup. See [Local preview](../LOCAL-PREVIEW.md). |

End-to-end scripts require a running development app and matching scanner,
storage, and database settings. Upload tests include the inert EICAR antivirus
test marker; do not disable security software to run them. Cleanup is part of
the test, but inspect failures for leftover fixtures before retrying.

## Offline cloud checks

These use synthetic fixtures and do not contact provider services or the live
database. They are separate from the normal contributor test command.

| File | Scope and output |
| --- | --- |
| `cloud-boundary-fixtures.mjs` | Tests size, pixel, and declared ZIP limits in memory. `--write-temp` saves fixtures in a new temporary directory. |
| `cloud-rejection-fixtures.mjs` | Generates small valid and invalid ZIP-policy fixtures and saves them in a new temporary directory. Acceptance by ZIP validation is not a scan verdict. |
| `cloud-positive-export-fixtures.mjs` | Tests generated build/image fixtures and package accounting. `--write-temp` retains originals and a manifest. |
| `cloud-export-rehearsal.mjs` | Exercises the promotion-package algorithm at its input boundary using temporary files. Does not test Next.js, S3 downloads, or hosted upload capacity. |
| `cloud-image-memory-rehearsal.mjs` | Prepares synthetic images or measures decoder memory. Requires an explicit mode and local directory; host measurements are specific to that machine. |
| `cloud-runtime-smoke.mjs` | Starts a temporary loopback server on port 3999 using a cloud build in `.next-check`. Tests startup, pages, and the pilot gate with synthetic settings; blocks provider traffic. |
| `verify-cloud-promotion-download.mjs` | Reads an explicitly selected downloaded ZIP and fixture manifest to compare contents and hashes. Does not download, upload, or change files. |

## Live provider checks

| File | Scope |
| --- | --- |
| `transloadit-probe.mjs`, `transloadit-probe-core.mjs` | Standalone provider evaluation. Default is a dry run; `--live` submits generated fixtures and can consume provider allowances or incur charges. It does not authorize app uploads. |
| `cloud-scan-smoke.mjs` | Checks the application's managed-scan adapter with generated fixtures. Default makes no provider requests; `--live` reads dedicated private credentials and submits files. |

Both live checks include the inert EICAR test marker. Review the target account,
limits, and approval before using `--live`. Do not substitute real user files
or work around a provider security block.

## Optional Compose and R2 tools

These belong to the alternative [home](../DEPLOY-HOME.md) and
[Oracle](../DEPLOY.md) profiles, not the current hosted cloud service.

| File | Effect |
| --- | --- |
| `home-stack.ps1` | Controls the home Compose stack, including builds, verification, backup/restore, and an explicitly enabled tunnel. Uses `.env.home`. |
| `home-backup.ps1` | Writes a PostgreSQL dump and an R2 inventory, verifies output, and prunes old local backups. The inventory does not copy stored archives; quarantine backup is opt-in. |
| `home-restore.ps1` | Plans a restore by default; `-Confirm` can replace database or quarantine-volume contents. `-Which audit` compares the current bucket with a saved inventory without restoring it. |
| `r2-inventory.mjs` | Reads R2 object metadata and database references and writes an inventory. Use `--env-file` to select one private configuration file. It does not repair or delete objects. |
| `setup-r2.mjs` | Creates an R2 bucket and storage credential using a privileged bootstrap token, then writes local configuration. This is provisioning, not a contributor setup step. |
| `smoke-prod.mjs` | Connects to a configured Compose deployment and scanner. `--full` also writes an upload fixture and removes it afterward. It is not a read-only cloud health check. |

Cloud backups are maintained in a private operations repository. Do not point
these home/R2 backup tools at the cloud pilot.
