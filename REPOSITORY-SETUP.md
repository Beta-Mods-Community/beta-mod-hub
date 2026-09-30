# Repository access

[Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub)
is the public application repository. Anyone can view the source, open issues,
fork it, and submit pull requests. Local development and the live Render site
use separate settings and databases.

## Community contributions

The Beta-Mods account owns the organization. Contributors work in their own
forks and submit pull requests; no invitation is needed. Only the owner merges
into the upstream repository or deploys the site. Public access does not grant
write access, production credentials, or access to user uploads.

The required `main` policy is:

- Changes go through a pull request with owner code review.
- One approving review is required, including code-owner review; new changes
  dismiss stale approvals.
- `Validate (default)` and `Validate (cloud)` must pass before merging.
- The branch must be up to date and review conversations resolved.
- Force pushes and deletion of `main` are blocked.

The owner retains administrator access, including the default admin bypass.
That is not contributor permission to bypass review. The owner remains
responsible for checking the revision and results before using that access.

No open-source license has been selected. GitHub viewing, Issues, forks, and
pull requests are welcome. Other reuse needs clarification until a license is
chosen. Uploaded mods and dependencies keep their existing rights. See
[Governance](GOVERNANCE.md).

## Production and backups

Render runs the existing `betamods-pilot` service. Automatic deployment and PR
previews remain off. Only the owner deploys a reviewed revision. Contributor
checks have no production credentials, database access, or write token.

All outside-contributor Actions runs require owner review and approval. Review
the proposed code, dependencies, scripts, and workflow changes before approval.
Do not use `pull_request_target` to execute untrusted code, pass secrets to fork
jobs, or run them on production or self-hosted runners. CI cannot approve or
merge its own pull requests. Test before merging, not by merging into `main`.

Backups run in a separate private, owner-only operations repository. Backup
credentials, encrypted archives, and recovery keys do not belong in this
application repository or its Actions runs. Source contributions do not need
operations access. See [Deployment](docs/DEPLOYMENT.md) for the operator guides.

## Current status

As of September 30, 2026, the existing repository is public. Issues and pull
requests are open to all GitHub users. The saved `main` protection rule was
verified with owner review, both required checks, up-to-date branches, resolved
conversations, and no force pushes or deletion. The default administrator
bypass remains available to the owner. Actions requires approval for all
external contributors; its default token is read-only and cannot approve PRs.

Production and backups remain private. No contributor write or deployment
access is granted by publication. Record the deployed revision in Render;
a merge alone does not update the live site.
