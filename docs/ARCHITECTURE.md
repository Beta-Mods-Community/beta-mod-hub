# Beta Mods architecture

This document describes the existing private application repository. It remains the sole codebase for the site, including its runtime, artwork, complete tests, and operational tooling. Application source, hosted user data, and permission to operate the live service are separate concerns.

## Application structure

| Location | Responsibility |
| --- | --- |
| `src/app` | Next.js App Router pages, server actions, and authenticated file routes |
| `src/components` | Forms, navigation, mod views, and reusable UI |
| `lib` | Account policy, authorization, catalog queries, feedback, uploads, scanning, storage, and promotion packages |
| `db` and `schema.sql` | Drizzle schema modules, SQL schema, and migrations |
| `scripts/scan-server.mjs` | Local HTTP wrapper for a real ClamAV daemon |
| `scripts/cloud-*.mjs` | Bounded Node runtime and request policy for the cloud pilot |
| `tests/*.test.ts` | Unit and policy tests that do not require live services |
| `tests/integration` | Database-backed tests with isolated development prerequisites |
| Other `scripts` and deployment files | End-to-end checks, operator tools, backups, and preserved alternative hosting configurations |

Next.js serves the UI and server-side application logic. PostgreSQL stores accounts, mod metadata, build references, feedback, quota reservations, and moderation state. File bytes are separate from database records: local development uses private filesystem storage, while the cloud profile uses private S3-compatible storage.

## Accounts and access

The current working sign-in flow uses email and passwords, verification, and recovery. Sessions are signed; account suspension and session-version checks can invalidate access. Administrative access is assigned by known account UUID, not an email string supplied at sign-up.

The hosted pilot's shared invitation code is an additional site-wide gate. It is not an account, a mod-specific download password, or permission to administer or upload. File uploads can require separate pilot approval. Private report attachments have their own authorization rules.

Author-controlled download codes, unlisted betas, and individual tester invitations are proposals. Nexus authentication and API clients include unfinished integration work and must not be presented as validated live features.

## Upload and download boundaries

Uploads follow this sequence:

1. Authenticate the actor, verify permissions, and check applicable limits.
2. Reserve quota and place incoming bytes in private quarantine.
3. Validate the file and obtain a successful malware-scan result.
4. Store the accepted file in final storage and record its reference.
5. Serve only authorized final files, never quarantine paths.

Quota checks, missing credentials, scanner failures, and uncertain scan results must fail closed. Image processing and archive checks impose additional resource limits in the bounded cloud profile. A scanner passing a file reduces risk; it is not a guarantee that the file is harmless or that a mod behaves safely in a game.

The local driver serves from private server-side storage through app routes. Object-storage drivers issue short-lived signed URLs after application checks. Keep buckets private and never use public object URLs as an authorization shortcut.

## Feedback and release packages

Bug reports and readiness votes are tied to the build tested. A new build does not inherit a previous version's readiness signal. Profiles and reputation summarize participation; the source contains the current calculation and its tests.

An owner can generate a release package from the latest scanned build, description, requirements, and scanned media. It contains text for manual Nexus publication and a requirements checklist. Authors review the generated BBCode and publish themselves, then record the final Nexus URL. The application does not automate Nexus's website or create a Nexus release on the author's behalf.

## Repository and operational access

Application source stays in this one private repository. No separate contributor app edition, artwork substitution, or manually mirrored source tree is required. Hosted database contents, uploaded files, and secret values do not belong in tracked source.

Operational workflows, history, and retained backup artifacts require their own access review. New invitations are on hold until their separation has been completed and verified. The contributor workflow configuration runs without provider credentials, but that does not certify that all other repository access is safe or that branch protection is configured.

Integration and live-provider checks remain available as separate, potentially mutating tools; they are not included in the credential-free contributor CI. A pull request is not permission to run an operator script, migrate a database, or deploy.

See [Deployment](DEPLOYMENT.md) for configuration profiles and [Contributing](../CONTRIBUTING.md) for isolated local setup and verification requirements. No open-source license has been adopted, and repository access does not grant permission to republish its code or assets.
