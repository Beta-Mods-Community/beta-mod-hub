# Beta Mods architecture

The app, artwork, tests, and deployment tools live in the public [Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub) repository. It is the existing app codebase and history, not a separate edition. Hosted user data and credentials stay private, and source access does not grant permission to operate the live site.

## Application structure

| Location | Responsibility |
| --- | --- |
| `src/app` | Next.js App Router pages, server actions, and authenticated file routes |
| `src/components` | Forms, navigation, mod views, and reusable UI |
| `lib` | Account policy, authorization, catalog queries, feedback, uploads, scanning, storage, and promotion packages |
| `db` and `schema.sql` | Drizzle schema modules, SQL schema, and migrations |
| `scripts/scan-server.mjs` | Local HTTP wrapper for a real ClamAV daemon |
| `scripts/cloud-*.mjs` | Cloud runtime, request limits, and cloud operations tools |
| `tests/*.test.ts` | Unit and policy tests that do not require live services |
| `tests/integration` | Database-backed tests with isolated development prerequisites |
| Other `scripts` and deployment files | End-to-end checks, operator tools, backups, and preserved alternative hosting configurations |

Next.js serves the pages and server-side actions. PostgreSQL stores accounts, mod details, build references, feedback, quota reservations, and moderation state. Files are stored separately, either on the local filesystem or in private S3-compatible storage.

## Accounts and access

Accounts use email and passwords, with verification and recovery. Sessions are signed. Suspension and session-version checks can revoke access. Administrators are identified by account UUID, not an email entered at sign-up.

The pilot access code unlocks the site, not an account or a particular mod. It does not grant admin or upload permissions. File uploads need separate approval in pilot mode, and private report attachments have their own access checks.

Per-mod download codes, unlisted betas, and individual invitations are not built yet. Nexus authentication and API integration are unfinished.

## Upload and download boundaries

Uploads follow this sequence:

1. Authenticate the actor, verify permissions, and check applicable limits.
2. Reserve quota and place incoming bytes in private quarantine.
3. Validate the file and obtain a successful malware-scan result.
4. Store the accepted file in final storage and record its reference.
5. Serve only authorized final files, never quarantine paths.

If quota checks fail, credentials are missing, or the scan result is uncertain, the upload must stop. Cloud image and archive checks also limit memory and processing work. A clean scan does not guarantee that a file is harmless or that a mod will behave safely in a game.

Local files are served through app routes. Object-storage drivers issue short-lived signed URLs after access checks. Buckets must stay private.

## Feedback and release packages

Bug reports and readiness votes belong to the build tested. A new build starts a new readiness tally. Profiles show testing history and reputation; the calculation and its tests are in the source.

Authors can export the latest scanned build, description, requirements, and scanned media as a release package. They review the BBCode, use the requirements checklist, and publish on Nexus themselves, then add the Nexus URL to the beta page. The app does not automate Nexus's website or publish for the author.

## Repository and operational access

There is one app codebase. Hosted database contents, uploads, and secrets must not be committed.

Backups run nightly in the private, owner-only `Beta-Mods/betamods-ops` repository, not a second app copy. Restore has been rehearsed, and old backup secrets and runs have been removed from the app repository. Anyone can read the source, open Issues, fork, and submit a pull request; only the owner merges and deploys. See [Repository setup](../REPOSITORY-SETUP.md).

Fork CI needs owner review and approval. It runs without production secrets, write tokens, or deployment previews. The merge policy requires `Validate (default)`, `Validate (cloud)`, and owner code review; GitHub protection settings must be verified separately. The default Actions token is read-only and cannot create or approve pull requests.

Integration and provider tests can change data and run separately from contributor CI. A pull request is not permission to run production scripts, migrate a database, or deploy.

See [Deployment](DEPLOYMENT.md) for settings and [Contributing](../CONTRIBUTING.md) for local setup and tests. No open-source license has been selected. GitHub forks and pull requests are welcome; other reuse needs license clarification.
