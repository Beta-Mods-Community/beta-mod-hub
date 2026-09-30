# Security reporting

Email **admin.betamods@gmail.com** with the subject `Beta Mods security report`. If GitHub private vulnerability reporting is enabled for this repository, you can use that instead. Do not put sensitive evidence in a normal Issue or pull request; other repository members may be able to read it.

## What to include

- The affected component and commit or release, if known.
- What the issue lets someone do and the permissions needed to reproduce it.
- Reproduction steps using your own local environment and test data.
- Redacted evidence and a possible fix, if you have one.

Leave out passwords, API keys, cookies, invitation codes, reset links, signed file URLs, private archives, and personal information. If you find an exposed secret, report where it is without copying it. Ask how to share a large or sensitive proof of concept before sending it.

## Safe investigation

Use an authorized local copy and accounts you control. Source access is not permission to attack the hosted site. Do not test denial of service, exhaust quotas, upload malware, bypass security warnings, or access someone else's records. Ask before testing anything that could affect the live pilot, provider accounts, or other users.

If you encounter another user's private data, stop and report the minimum needed to locate the issue. Do not keep browsing, download more data, or post evidence publicly.

## Response and disclosure

This is a small volunteer project with no guaranteed response time or paid bounty program. Please coordinate disclosure with the maintainer while the report is investigated and fixed. Credit reporters only with their permission.

Development is on `main`; older snapshots and forks do not have a separate security patch schedule. Passing tests or scans does not guarantee that a deployment is secure or a file is harmless.

## Maintainer handling

Nightly backups run in the owner-only `Beta-Mods/betamods-ops` repository, and a restore rehearsal has succeeded. The app repository's four old backup secrets and four backup workflow runs have been removed. Access settings for [Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub) have been checked. The owner can invite approved contributors; nobody has been invited yet. See [Repository setup](REPOSITORY-SETUP.md).

Private-fork pull requests cannot run Actions automatically. After reviewing the diff, the owner tests locally or manually dispatches checks on a reviewed owner-controlled branch, without production credentials. Do not merge into `main` to obtain a test result. Contributor CI uses no service secrets; the default Actions token is read-only and cannot create or approve pull requests.

The current Free plan does not provide branch protection for this private repository, so the owner must review changes and test results before merging. Do not grant source contributors access to backup artifacts or production credentials.

Keep reports private. Check affected versions, user impact, and whether credentials need rotation. Add a fix and regression tests, deploy it, and agree on disclosure timing. Record anything still unresolved. Do not dismiss a report just because existing tests or scans passed.
