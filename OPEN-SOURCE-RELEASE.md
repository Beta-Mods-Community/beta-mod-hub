# Community source release preparation

This is a private maintainer checklist, not public contributor documentation.
Keep this file and the existing deployment repository private. The public app
source is prepared separately so Git history, retained backup artifacts,
provider configuration and operational records do not become public by accident.

## Publication boundary

The intended community repository is `Beta-Mods/betamods`. It has not been
created or published by this preparation document. The current private
`Beta-Mods/beta-mod-hub` remains the deployment and backup repository. Do not
change its visibility or remove the backup workflow's private-repository guard.
No automatic mirroring or deployment from unreviewed community code is allowed.

The local exporter uses an explicit source allowlist. It copies runtime code,
schemas, selected credential-free tests, contributor docs and the public CI
workflow. It never copies `.git`, environment values, user uploads, original
branding images with undocumented redistribution rights, backups, operational
workflows, deployment runbooks or machine-specific launch scripts.

`community/` contains the generic public AGENTS and environment template plus
original SVG placeholders. Export replaces only the homepage illustration
reference and package metadata/scripts; it does not edit the running website.
Deployment-specific integration and operational tests remain in this private
repository. Public unit-test totals therefore differ and must be reported
separately, not presented as lost coverage in the private project.

## Gates before the first public push

1. The owner selects a license. Add its full canonical text to `LICENSE`, clarify
   its scope in contributor docs, and review dependency and asset obligations.
2. Finish and record a redacted audit of all reachable private Git history and
   the exact public snapshot. Pattern scanning is not a security certification.
   A secret finding requires private remediation, not merely deleting its line.
3. Run `node scripts/export-community-source.mjs --output <new-directory>`.
   It refuses existing output directories. Do not reuse the private `.git` or
   push its history to the community repository.
4. In the clean export, validate with Node.js 22, no private environment files,
   no inherited service credentials and a clean `npm ci`. Run the contributor
   checks in both build profiles. Review the exact staged file list and diff.
5. Create the separate public source repository only after the publication
   scope and license are settled. Initialize a new Git history using project
   identity, not a personal email copied from local Git configuration.
6. Configure protection for `main`: require a pull request, approving review,
   resolved conversations and both `Validate (default)` and `Validate (cloud)`
   checks. Prevent force pushes and deletion. Keep owner administration for
   recovery but do not use it to bypass ordinary review.
7. Enable private vulnerability reporting if available. Restrict workflow
   tokens to read-only, keep secrets absent and require approval for all
   outside-contributor workflow runs. Do not use self-hosted runners,
   `pull_request_target`, privileged follow-up workflows or automatic PR deploys.
8. Verify the public CI run and repository permissions. Only then share the
   public repository link. Do not claim protection is active from CODEOWNERS
   or workflow YAML alone; verify GitHub's actual settings.

## Ongoing contributions and deployment

The public repository is the collaboration home for app changes. Contributors
fork, branch and open pull requests. Maintainers inspect changes, including
dependency/workflow changes, before approving CI or merging. A green check does
not make malicious code safe or grant access to production.

After review, a maintainer can import the specific accepted app commits into
the private deployment repository, resolving any differences in artwork or
operations explicitly. Run private validation as appropriate, then deploy
through the existing controlled release process. Never mirror private commits,
workflows, logs, artifacts or environment files back into the public repository.
Do not automate this import until its permissions and failure modes are reviewed.

Community governance can expand maintainer responsibility over time. Production
credentials, user data and author's file permissions are separate from source
contribution access and must remain so.
