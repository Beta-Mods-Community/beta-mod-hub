# Architecture

Beta Mods is a Next.js application backed by PostgreSQL and private file
storage. The public repository contains the application, tests, assets, and
deployment tools. Hosted data and credentials are not part of the source.

## Code layout

| Location | Responsibility |
| --- | --- |
| `src/app` | App Router pages and authenticated HTTP routes |
| `src/components` | Forms, navigation, mod views, and shared UI |
| `src/lib` | Browser-safe upload progress, response recovery, and cloud action diagnostics |
| `lib` | Server actions and queries, shared policies and helpers, uploads, scanning, storage, and release packages |
| `db` and `schema.sql` | Drizzle schema modules, SQL schema, and migrations |
| `scripts/scan-server.mjs` | HTTP wrapper for a local ClamAV daemon |
| `scripts/cloud-*.mjs` | Bounded cloud runtime and operator tools |
| `tests/*.test.ts` | Unit and policy tests without live services |
| `tests/integration` | Tests that write to a development database |
| Deployment files and other `scripts` | Local launchers, provider checks, and alternative hosting tools |

PostgreSQL holds accounts, listing text, build references, reports, votes,
quota reservations, and moderation state. Uploaded bytes live separately in
local storage or a private S3-compatible bucket. Storage keys are not public
file URLs.

## Shared UI

Use the color and spacing patterns in
[`src/app/globals.css`](../src/app/globals.css), including theme utilities such
as `bg-surface`, `text-muted`, and `border-line`. Shared classes include
`site-container`, `panel`, `field`, `button-primary`, and `button-secondary`.
Reuse the existing form feedback, status badges, and section headings in
`src/components` so labels, focus styles, and behavior stay consistent.

[`SectionHeading`](../src/components/section-heading.tsx) keeps a visible heading
and accepts an optional `description` to explain its icon.
[`ContextHelp`](../src/components/context-help.tsx) renders a non-submit button
and a native popover for explanatory text. Give icon-only triggers a descriptive
`label`. Keep help outside links and action buttons, and never pass interactive
children to it. Where a whole card is a link, use `StatusBadge` with
`explain={false}` to keep the badge passive. Help must not replace a download,
navigation, vote, or form action.

Keep pages and data access on the server; add client boundaries only where
interaction needs them. Pass rendered icons or content as children to a client
component instead of passing component functions across the boundary. Browser
helpers must not import database, credential, or other server-only modules.

UI tests such as `semantic-badges`, `context-help`, and `testing-details` cover
source structure, generated markup, and pure positioning logic. They do not
exercise a browser DOM, native popover events, layout, or screen-reader behavior.
For affected UI, also check keyboard focus, hover, click/tap, dismissal, and
narrow viewports with synthetic data. Report the checks actually performed.

## Accounts and authorization

Accounts use email/password login, verification, and recovery. Signed sessions
are checked against account suspension and session version so access can be
revoked. Administrators are configured by account UUID.

The pilot access code unlocks the site only. Account login, upload approval,
ownership checks, and private-attachment permissions remain separate checks.
Per-mod access codes and invitations are not implemented. Nexus sign-in and
API integration are unfinished and must remain disabled until validated.

## Upload lifecycle

1. Authenticate the actor, verify permissions, and check limits.
2. Reserve quota and write incoming bytes to private quarantine.
3. Validate the file and obtain a clean malware-scan result.
4. Store accepted bytes in final storage and commit their reference.
5. Serve only authorized final files, never quarantine paths.

Quota failures, missing credentials, and uncertain scan results reject the
upload. The cloud profile also bounds archive expansion, decoded image size,
request bodies, and concurrent work. A clean scan does not guarantee a file
is harmless or a mod is compatible with a game.

Local files are served through application routes. Object-storage drivers
issue short-lived signed URLs after access checks. A private report attachment
is available only to its reporter and the mod author.

Storage reservations track held and stored bytes. If a remote write or cleanup
has an uncertain outcome, its quota charge stays in place until reconciliation.
Releasing a stale reservation on age alone could undercount real stored files.

## Feedback and release packages

Reports and readiness votes identify the build tested. New builds start a new
tally; previous feedback remains in history. Report updates and promotion use
the same parent-row lock to prevent conflicting changes during a scan. See
[Feedback schema](../db/feedback-schema.md).

Authors can export the latest scanned build, listing text, requirements, and
scanned gallery images. They review the generated BBCode and publish on Nexus
manually, then add the release URL to Beta Mods. No Nexus website automation
or automatic publishing is implemented.

## Deployment boundaries

The current hosted profile uses Render, Neon, private Supabase S3 storage,
Transloadit scanning, and Resend mail. It has stricter file and memory limits
than the local/Compose profiles. See [Deployment](DEPLOYMENT.md) for settings
and [Cloud operations](../DEPLOY-CLOUD.md) for runtime limits and known gaps.

The Windows/R2 and Oracle Compose targets are retained alternatives, not the
live site. Do not mix their environment files, backup tools, or databases with
the cloud profile.

## Contributions and operations

Anyone can read the source, open an Issue, fork, and submit a pull request.
Only the owner merges and deploys. Contributor CI runs without hosted service
secrets; database and provider tests run separately against isolated targets.
Backup jobs and credentials belong to a private operations repository, not
contributor CI.

See [Contributing](../CONTRIBUTING.md) for development, [Repository setup](../REPOSITORY-SETUP.md)
for review controls, and [the product specification](../beta-mod-hub-spec.md)
for product rules. A software license has not yet been selected; consult the
repository's licensing notice before using the code outside contributions.
