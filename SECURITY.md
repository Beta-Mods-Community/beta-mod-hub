# Security reporting

Email **admin.betamods@gmail.com** with the subject `Beta Mods security report`. If GitHub private vulnerability reporting is enabled for this repository, you can use that instead. Normal Issues and pull requests are public. Do not put sensitive evidence in them.

## What to include

- The affected component and commit or release, if known.
- What the issue lets someone do and the permissions needed to reproduce it.
- Reproduction steps using your own local environment and test data.
- Redacted evidence and a possible fix, if you have one.

Leave out passwords, API keys, cookies, invitation codes, reset links, signed file URLs, private archives, and personal information. If you find an exposed secret, report where it is without copying it. Ask how to share a large or sensitive proof of concept before sending it.

## Safe investigation

Use a local copy and accounts you control. Public source is not permission to attack the hosted site. Do not test denial of service, exhaust quotas, upload malware, bypass security warnings, or access someone else's records. Ask before testing anything that could affect the live pilot, provider accounts, or other users.

If you encounter another user's private data, stop and report the minimum needed to locate the issue. Do not keep browsing, download more data, or post evidence publicly.

## Response and disclosure

This is a small volunteer project with no guaranteed response time or paid bounty program. Please coordinate disclosure with the maintainer while the report is investigated and fixed. Credit reporters only with their permission.

Development is on `main`; older snapshots and forks do not have a separate security patch schedule. Passing tests or scans does not guarantee that a deployment is secure or a file is harmless.

## Maintainer handling

Nightly backups run in the private, owner-only `Beta-Mods/betamods-ops` repository, and a restore rehearsal has succeeded. The app repository's old backup secrets and backup workflow runs have been removed. Public source access must never expose backup artifacts, recovery keys, uploaded files, or production credentials. See [Repository setup](REPOSITORY-SETUP.md).

Review fork changes before approving CI, especially dependency, script, and workflow changes. Run checks without service secrets, write tokens, self-hosted runners, or Render preview deployments. Do not use `pull_request_target` to execute untrusted contribution code. Do not merge into `main` to obtain a test result.

Only the owner merges and deploys. The merge policy requires a pull request, passing `Validate (default)` and `Validate (cloud)` checks, and owner code review. Force pushes and deletion of `main` must be blocked. Verify those settings in GitHub rather than assuming the workflow or this document enforces them.

Keep reports private. Check affected versions, user impact, and whether credentials need rotation. Add a fix and regression tests, deploy it, and agree on disclosure timing. Record anything still unresolved. Do not dismiss a report just because existing tests or scans passed.
