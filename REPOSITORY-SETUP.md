# Repository access

[Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub)
is the private application repository. Local development and the live Render
site use this codebase with separate settings and databases.

## Community contributions

The Beta-Mods account owns the organization. Contributors are invited to this
repository as outside collaborators with **Read** access. They can create a
private fork in their personal GitHub account and submit pull requests, but
cannot push or merge into this repository. Private forking is enabled.

Only the owner or an explicitly appointed maintainer merges changes. GitHub
Free does not provide branch protection for this private repository, so CI
and CODEOWNERS help with review but do not enforce approval requirements.

No contributors have been invited yet. Ask interested community members for
their GitHub usernames, confirm who should have access, and invite them with
the Read role. The repository link returns 404 for people without access.

The source is not publicly licensed. See [GOVERNANCE.md](GOVERNANCE.md) for
contribution and reuse terms. Access to source does not grant rights to
uploaded mods or access to production data.

## Production and backups

Render runs the existing `betamods-pilot` service. Automatic deployment and PR
previews remain off. Deploy only a reviewed revision; contributor checks run
without production credentials or database access. Fork pull-request workflows
are disabled. The owner checks reviewed changes locally or runs the workflow
on a reviewed branch before merging; a fork cannot start upstream jobs.

[Beta-Mods/betamods-ops](https://github.com/Beta-Mods/betamods-ops) is a separate
private, owner-only repository for backup scripts and their tests. It does not
contain another copy of the application. Nightly backups are enabled there,
and two retained archives passed decryption, file-hash and disposable
database restore checks.

The application's old backup job is disabled. Its four backup secrets and four
backup runs, including retained artifacts, have been removed. Both older
encrypted archives were preserved outside Git before removal. Recovery keys
remain private; never give them to source contributors.

## Current status

As of September 30, 2026, the existing repository has been transferred without
changing its history or making it public. There is no public mirror or second
maintained application repository. The abandoned local community draft and
internal investigation notes are outside the tracked source tree.

The owner is the only person with repository access. Invite contributors only
after confirming their GitHub usernames and intended Read access. Record the
deployed revision in Render; a merge alone does not update the live site.
