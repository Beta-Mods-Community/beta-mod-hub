# Beta Mods product specification

Beta Mods helps authors test unreleased game mods, collect build-specific bug
reports, and prepare a release package for Nexus Mods. It is not affiliated
with Nexus Mods and does not publish files there on an author's behalf.

This document describes the product rules. For the code layout, see
[Architecture](docs/ARCHITECTURE.md). The SQL contract is [schema.sql](schema.sql),
mirrored by the Drizzle modules in `db/`. Deployment-specific limits belong in
[Deployment](docs/DEPLOYMENT.md).

## Current scope

Implemented:

- Email/password accounts, verification, password recovery, and session revocation.
- Mod listings, versioned scanned builds, media galleries, and requirements.
- Build-specific bug reports, private attachments, author responses, and retests.
- Readiness votes, tester profiles, and derived reputation scores.
- Browse filters and pagination, follows, notifications, and moderation.
- Downloadable release packages and author-confirmed links to released Nexus pages.
- Pilot upload approval, quota reservations, and an upload pause switch.

Not implemented or not ready for use:

- Nexus sign-in and live API integration. The repository contains unvalidated
  scaffolding, not a supported authentication path.
- Requirement search against Nexus's catalog.
- Per-mod download codes, unlisted listings, and individual mod invitations.
- Durable background uploads for large files.

The core testing workflow must continue to work without Nexus integration.

## Accounts and roles

An account can be both an author and a tester. These are activities, not
separate account types.

- Authors maintain listings, upload builds, respond to reports, request retests,
  and prepare releases.
- Testers download builds, submit reports, and vote on the build they tested.
- Administrators manage upload approval and moderation. Administrator access
  uses explicit account UUIDs, never an email supplied during registration.

The hosted pilot's site access code is separate from account login. Passing
that gate does not grant upload, administrator, or private-attachment access.

## Pages and workflows

### Mod page

Each listing includes its author, game, status, tags, description, requirements,
scanned media, and build history. Status is `alpha`, `beta`, `rc`, `promoted`, or
`abandoned`.

Descriptions are stored as Markdown/plain text. BBCode is generated only for
release exports. Requirements are author-supplied names and optional Nexus
URLs; the app does not verify dependencies against Nexus.

Reports include severity, description, reproduction steps, and the build
tested. Attachments are optional, scanned, and private to the reporter and mod
author. A report can be open, acknowledged, or fixed. The reporter can retest a
specific build and reopen an issue that is still present.

Readiness votes belong to a build, with one vote per tester/build pair. The
latest build has its own tally. Earlier votes remain in testing history; they
do not carry forward as approval of a newer build. A stale form must not submit
a vote for a build the tester has not seen.

### Browse and dashboard

Browse lists active, visible betas, with search, game filters, pagination, and
sorting. Promoted, abandoned, and moderated-hidden listings are excluded from
the active catalog.

The dashboard separates authored mods from testing activity. Profiles show a
bio, avatar, join date, authored mods, testing history, and reputation.

There is no general comment wall or public download-count competition. Reports
and readiness signals are intended to help an author decide what needs work.

## Data model

The main relationships are:

```text
User -> BetaMod -> Build
               -> Requirement
               -> ModMedia

User -> BugReport -> Build
                 -> BugReportWorkflow
                 -> BugAttachment

User -> ReadySignal -> Build
User -> NexusLink (reserved for future integration)
```

Additional tables hold account tokens, rate limits, follows, notifications,
moderation state, pilot accounts, settings, and storage reservations. See
`db/schema.ts`, `db/feedback-schema.ts`, and `db/community-schema.ts` for the
complete typed model. Keep these definitions, `schema.sql`, and migrations in
sync. Do not use this overview as a migration specification.

### Reputation

`lib/reputation.ts` calculates reputation from testing history at query time;
the raw score is not stored. The current formula is:

```text
2 * distinct mods tested
+ ready votes
+ 3 * not-ready votes
+ minor reports + 2 * major reports + 3 * blocking reports
```

For accounts with at least three mods judged and no not-ready votes, each
ready vote contributes 0.25 instead of 1. Scores use one decimal place; tiers
are New Tester, Active Tester, Experienced Tester, and Trusted Tester.

This is a participation heuristic, not a guarantee of report quality or
trustworthiness. Changes to its weights or incentives need discussion and
tests in `tests/reputation.test.ts`.

## Release package

The author downloads a ZIP generated from the latest scanned build, listing
text, requirements, and scanned gallery images:

```text
promotion-<mod>/
  description.bbcode.txt
  summary.txt
  readme.txt
  changelog.txt
  requirements.txt
  files/<build archive>
  media/<numbered gallery images>
  media/captions.txt
```

The media files are included only when the listing has gallery images. The
summary is limited to 250 characters by the current package generator. The
requirements file is a checklist, not an automatic dependency import.

The author reviews the package, creates or updates their Nexus page manually,
and confirms the live Nexus URL on Beta Mods. Confirmation marks the listing
`promoted`, removes it from Browse, and makes its beta page read-only with a
link to the release. Export alone does not mark a listing promoted.

Only final scanned storage may supply package files. Cloud exports enforce
their own input and metadata limits. Missing or unreadable files must fail
the export instead of producing an incomplete package silently.

## Nexus integration boundaries

`lib/nexus.ts`, `lib/nexus-sso.ts`, and `lib/nexus-keys.ts` contain preparatory
code. Keep Nexus authentication disabled until endpoint URLs, response fields,
scopes, account-linking behavior, and the required registration process have
been checked against the provider's current documentation and tested.

Do not assume a particular API can create mod pages, upload files, or provide
OAuth identity. Confirm each capability before implementing it. Any required
user credentials must remain server-side and encrypted at rest. Never share
one user's key with another user's requests.

Use the supported API, not browser automation against Nexus's site. Cache and
pace read requests, handle rate limits, and keep the manual release-package
workflow available independently of any later integration.

## Security and resource requirements

- Every accepted file follows quarantine, validation, malware scanning, then
  final storage. Development does not bypass scanning.
- Quarantine and object buckets stay private. Download routes enforce the
  relevant account, listing, and attachment permissions before serving bytes
  or issuing a short-lived signed URL.
- Missing credentials, uncertain scan results, or unavailable quota accounting
  must refuse uploads, not fall back to an unchecked path.
- Storage reservations are atomic. Uncertain remote writes retain their charge
  until reconciliation confirms their outcome.
- Moderation and promotion checks must be repeated when a write commits; a
  long-running scan must not permit a stale authorization decision.
- A clean scan is not proof that a mod is safe or compatible with a game save.
- Provider-specific file, memory, and cost controls are deployment constraints,
  not reasons to weaken these rules.

## Contribution priorities

Fixes to the existing testing workflow, accessibility, reliability, and clear
documentation take priority over new provider integrations. Discuss changes to
authentication, moderation, permissions, storage, or resource limits before
implementation. See [Contributing](CONTRIBUTING.md).
