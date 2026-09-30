# Security reporting

Report suspected vulnerabilities privately to **admin.betamods@gmail.com** with the subject `Beta Mods security report`. If this repository explicitly offers GitHub's private vulnerability reporting, that is also an appropriate channel. A normal Issue or pull request can be visible to everyone with repository access; do not use it for sensitive evidence.

## What to include

- The affected component and commit or release, if known.
- A clear description of the impact and the permissions needed to reproduce it.
- Minimal reproduction steps using your own local environment and synthetic data.
- Redacted evidence and a possible fix, if you have one.

Do not send passwords, API keys, session cookies, pilot invitation codes, reset links, signed file URLs, private archives, or other people's personal information. If a secret is exposed, identify its location without copying its value. Arrange a suitable private transfer before sending a large or sensitive proof of concept.

## Safe investigation

Use an authorized local copy and accounts you control. Access to source code is not permission to scan or attack the hosted service. Do not test denial of service, exhaust quotas, upload malware, bypass security warnings, or access or change someone else's records. Contact the maintainer before any testing that could affect the live pilot, provider accounts, or other users.

If you encounter another user's private data, stop and report the minimum needed to locate the issue. Do not keep browsing, download more data, or post evidence publicly.

## Response and disclosure

This is a small volunteer-maintained project. The maintainer will investigate reports as available; there is no guaranteed response time or paid bounty program. Coordinate disclosure after assessment and remediation so users are not exposed while a fix is being prepared. Acknowledge contributors with their permission.

Current development is on `main`. There is no maintained security patch schedule for older snapshots or forks. Repository checks are useful evidence, not a guarantee that every deployment is secure or that uploaded files are harmless.

## Maintainer handling

This private repository retains the application's operational tooling and history. Before inviting collaborators, verify the separation of backup artifacts, privileged workflows, and production credentials. Credential-free pull-request checks do not establish that other repository material is safe to expose. New invitations remain on hold until that review and separation are complete.

Keep reports and any identifying evidence private. Assess affected versions, user impact, and whether credentials need rotation. Prepare a focused fix and regression tests without publishing exploitable detail prematurely. Coordinate deployment and disclosure, document any remaining limitations, and never use a passing scan or test suite as a substitute for investigating the report.
