# Beta Mod Hub — Build Spec

Hand this file to Codex as the starting brief. It covers what to build and why. Treat "Explicit non-goals" and "Nexus Integration" as hard constraints — everything else is a reasonable default that can flex.

## What this is

A companion site to Nexus Mods, scoped to one function: hosting mods during their beta/testing phase, before they ever go live on Nexus. It is not a general mod host and does not replace Nexus for finished releases — every mod here is pre-release, and once an author promotes a mod, its home becomes Nexus, not this site.

Why this shape: a mod's first Nexus release is effectively its only shot at the "New Releases" spotlight — a rough launch buries it long-term even if it's polished later. This site lets authors get real testing and bug reports on a WIP build without spending that shot, and without cluttering Nexus's main feeds with unstable releases.

## Users

Most accounts are both roles at once — one account, two roles, not two account types.
- **Author** — uploads a WIP mod, wants structured bug reports and a ready/not-ready signal, then wants to promote to Nexus with minimum friction.
- **Tester** — browses active betas, downloads WIP builds, files bug reports, casts a ready/not-ready verdict for the build they tested.

## Pages

**Profile** — same shape as a Nexus profile: avatar, bio, join date, linked Nexus account. "Beta Mods" instead of Nexus's "Files." "Testing History" instead of endorsements given (mods tested, bugs filed, votes cast) — this feeds `User.reputation_score` (see Data Model), the only signal an author has for whether to trust a given "ready" vote.

**Beta Mod Page** — same tab layout as a Nexus mod page, repurposed:
- Header: title, author, game, tags, screenshot carousel
- Description tab: what it does, current state, known issues, what kind of testing is wanted
- Files tab: build versions (0.1, 0.2, RC1...) with per-build changelogs
- Bugs tab: structured reports only — severity, repro steps, log/save attachment. No general comment wall; that's the unproductive-comment clutter this project exists to avoid.
- Sidebar: the latest build's ready/not-ready tally and tester count instead of endorsements. A new build starts a fresh release signal; earlier verdicts remain in tester history. No public download counter — Nexus zeroes this out at real launch anyway, so it means nothing here.
- Requirements field, matching Nexus's structure.

**Browse** — no Nexus equivalent; this is the page that gets people to actually show up. Live list of active betas, filterable by game, sortable by "needs testers" (low tester count / stale) and by recency. Status badge: Alpha / Beta / RC.

**Dashboard** — two tabs, since most users are both roles: *Building* (own beta mods, aggregated feedback, the Promote action) and *Testing* (tracked mods, own feedback history).

## Data model

```
User
  id, nexus_user_id (nullable until SSO-linked), display_name,
  avatar_url, bio, created_at, reputation_score (derived, not stored raw)

BetaMod
  id, owner_id -> User, title, description (plain/markdown — NOT BBCode;
  BBCode is generated only at promotion time), game, tags[],
  status (alpha | beta | rc | promoted | abandoned), created_at, updated_at

Build
  id, beta_mod_id -> BetaMod, version_label, file_url, changelog, uploaded_at

BugReport
  id, beta_mod_id, build_id, reporter_id -> User,
  severity (minor | major | blocking), description, repro_steps,
  attachment_url, status (open | acknowledged | fixed), created_at

ReadySignal
  id, beta_mod_id, build_id -> Build, tester_id -> User,
  is_ready (bool), created_at
  — one row per (build_id, tester_id); upsert on a repeat verdict for that
  build. Mod pages and Browse count only the newest build; older rows stay as
  testing/reputation history.

Requirement
  id, beta_mod_id, nexus_mod_name, nexus_mod_url
  — self-reported by the author, not verified against Nexus; reconciled
  manually at promotion time (see below)

NexusLink
  id, user_id -> User, nexus_api_key (encrypted at rest), linked_at
```

`reputation_score` is derived from `ReadySignal` history (and `BugReport`s filed), computed at query time — not stored raw. The formula (implemented in `lib/reputation.ts`, unit-tested in `tests/reputation.test.ts`) deliberately discounts testers who only ever vote ready, so an author can tell a real "ready" from a rubber stamp:

```
score =
  2 × distinct mods tested            (volume of real testing)
+ 1 × ready votes                     (positive, but cheap — worth less)
+ 3 × not-ready votes                 (the critical, hard signal)
+ severity-weighted bug reports:      (actionable, structured feedback)
    minor 1, major 2, blocking 3
```

An "always ready" tester — ≥3 mods judged and never one not-ready — gets ready votes counted at 0.25× each, so rubber-stamping caps out far below a genuinely critical tester even with similar volume. Scores keep one decimal place; `reputationTier()` maps them to friendly labels (New / Active / Experienced / Trusted Tester) for UI display.

## The promotion package

Nexus's Upload API can push a new file to a mod page that **already exists** on Nexus — it cannot create a new page from nothing. So promotion is not a single API call. On Promote, generate a downloadable zip built to make the manual Nexus upload as fast as possible:

```
promotion-package/
├── description.bbcode.txt   paste into Nexus's Description field (BBCode)
├── summary.txt               paste into the short description field
│                             (stay under Nexus's character limit — validate
│                             at generation time, not just at paste time)
├── readme.txt                paste into Nexus's Docs step
├── changelog.txt             paste into Nexus's Articles/changelog step
├── requirements.txt          dependency names + Nexus URLs — a checklist,
│                             not a paste target: Nexus's requirements field
│                             is search-and-link, not free text
├── files/                    the mod archive(s), ready to drag into Files
└── media/                    pre-selected screenshots, numbered in order
```

**Promotion flow:**
1. Author clicks Promote on a `BetaMod`.
2. Site generates the package from the mod's stored description, latest `Build`, changelog, and `Requirement` list.
3. Author downloads it, opens a new mod page on Nexus, works top to bottom pasting/dragging each piece in.
4. Author confirms promotion is done (pastes the live Nexus URL back in, or — once Nexus's API supports it — this step calls the API directly).
5. `BetaMod.status` → `promoted`. Drops off Browse; the beta page becomes read-only and links to the live Nexus page.

Do not build browser automation against nexusmods.com to drive their upload form directly — fragile against their UI changes and outside the API's intended use. The package-download approach is the actual design, not a stopgap; keep it even if a future API version makes more automation possible, and just let the flow shed manual steps as that happens.

## Nexus integration

- **Auth**: "Login with Nexus" — their API supports login via API key or SSO. Use it to link accounts instead of building separate passwords; it also captures the per-user API key needed for any future file-push step.
- **Upload API**: open beta as of mid-2026, scoped to pushing a new file to a mod page that already has at least one file. Do not design around it creating pages — it doesn't. Keep the promotion flow able to drop the "paste this" steps one by one if Nexus's API scope grows, without needing a rebuild.
- **Registration**: personal API keys are for testing/personal use only. Before real users touch this, register the app with Nexus (support@nexusmods.com) per their API Acceptable Use Policy. Any file-push should run under each user's own linked key, never a shared app-wide one.
- **Rate limits**: assume the API is rate-limited; cache or batch read calls (game list, mod metadata) rather than hitting it per page load.

## Explicit non-goals

- Not a host for finished/released mods — that's Nexus's job. Promoted mods live there, not here.
- Not a discussion platform — Bugs is structured reports only, by design, not a comment section.
- Not a stats competitor to Nexus — no public download/endorsement-style counts pre-promotion.
- No browser automation against Nexus's site. API only.

## Suggested stack (a starting point, not a constraint)

- Next.js (or similar full-stack React framework) for pages + API routes
- Postgres — the data model above maps directly to relational tables
- S3-compatible object storage + CDN for build files and screenshots
- Nexus SSO as primary auth; store the linked API key encrypted
- Malware scanning on every uploaded file — non-negotiable, this accepts archives from strangers

## Build order

1. **Core loop, no API** — accounts, BetaMod CRUD, Build uploads, unstructured feedback. Validates "post a beta, get feedback" before anything Nexus-specific exists.

   > Phase-1 deviation (2026-09): while this line was being implemented, the
   > planned temporary comment wall was skipped in favor of going straight to the
   > structured BugReport + ReadySignal tooling of phase 2. The "Bugs tab" page
   > description explicitly rules out a general comment wall (pointlessly
   > building one just to delete it), and phase 1's core loop now validates as:
   > accounts → BetaMod CRUD → build uploads → structured feedback.
2. **Real feedback tooling** — structured BugReport tracker, ReadySignal tally, Browse with filters/sort. This phase alone is close to the full value proposition, with zero Nexus integration.
3. **Nexus integration** — SSO login, NexusLink, promotion package generation and download.
4. **Polish** — reputation scoring, richer profiles, requirement auto-suggest (fuzzy-match against Nexus mod names via the API's read endpoints).

   > Phase-4 partial (2026-09): reputation scoring and richer profiles shipped.
   > Requirement auto-suggest is deferred — it needs the Nexus read API's search
   > endpoints, which we still don't touch until the SSO registration details
   > (and a real API key for dev) exist. Until then requirements stay
   > self-reported, as the data model already describes.

Phase 2 is the point this becomes a coherent, shippable product. Nexus integration is additive on top of that, not load-bearing for the core loop.
