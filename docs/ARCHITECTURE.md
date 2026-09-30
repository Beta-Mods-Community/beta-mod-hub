# Beta Mods architecture

This document describes the application in the community source snapshot. It separates the website's code and security boundaries from the private operation of the hosted pilot.

## Application structure

| Location | Responsibility |
| --- | --- |
| `src/app` | Next.js App Router pages, server actions, and authenticated file routes |
| `src/components` | Forms, navigation, mod views, and reusable UI |
| `lib` | Account policy, authorization, catalog queries, feedback, uploads, scanning, storage, and promotion packages |
| `db` and `schema.sql` | Drizzle schema modules, SQL schema, and migrations |
| `scripts/scan-server.mjs` | Local HTTP wrapper for a real ClamAV daemon |
| `scripts/cloud-*.mjs` | Bounded Node runtime and request policy for the cloud pilot |
| `tests` | Unit and policy tests that do not require live services |

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

## Public source and private operations

This repository omits live credentials, user content, database exports, backups, deployment history, and service-specific operator tools. Its GitHub workflow validates untrusted contributions without production access. A merged pull request is source code, not authorization to deploy it or migrate a database.

See [Deployment](DEPLOYMENT.md) for supported configuration profiles and [Contributing](../CONTRIBUTING.md) for an isolated local setup. Artwork in the community edition differs from the running site's artwork; see [Source and asset scope](../ASSETS.md).
