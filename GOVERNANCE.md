# Beta Mods governance

The goal is for authors and testers to help shape and run Beta Mods. For now, the owner makes the final decisions and is responsible for the site. There is no community council or formal voting system yet.

Anyone can read the [source](https://github.com/Beta-Mods-Community/beta-mod-hub), open issues, fork it, and submit pull requests. See [Contributing](CONTRIBUTING.md) for setup and the review process.

## Decisions today

Suggest changes in Issues, pull requests, or Discord. The owner handles merges, releases, moderation, costs, and hosting, and should explain why larger proposals are accepted, deferred, or declined.

Small fixes can go straight to a pull request. Discuss larger changes first, especially changes to privacy, costs, moderation, or how people use the site. Explain the problem and tradeoffs, ask the people affected, and record the decision. Revisit it if the result does not work.

Community preferences matter, but changes still need to protect users and stay affordable. Security fixes may need private discussion until it is safe to explain them.

## Ways to help

- Test changes and write reproducible reports.
- Improve design, accessibility, documentation, and onboarding.
- Contribute focused code changes and review others' work.
- Suggest testing standards and moderation practices.
- Help maintain components consistently over time.

You do not need to code to help. Keep disagreements about the work and leave private information out of discussions.

## Becoming a maintainer

People who contribute regularly can help review and maintain a part of the project. Agree on responsibilities before granting permissions. This does not grant merge or deployment access; those remain with the owner.

Hosting, billing, storage, secrets, user data, and site administration need separate permission. Public source access does not grant access to those systems. Remove permissions when they are no longer needed.

With more maintainers, we can agree on shared decision-making. That agreement should say who decides what, how disputes are resolved, and who handles security and hosting. Until then, the owner remains responsible; an informal poll does not transfer that responsibility.

## Source code and hosted content

No open-source license has been selected. GitHub viewing, Issues, forks, and pull requests are welcome; wider reuse needs clarification until a license is chosen. This does not change the rights of uploaded mods or dependencies, or make user data public. Submit only work you have the right to contribute for use in Beta Mods, and explain restrictions first. This guide does not transfer copyright or create a separate contributor license agreement.

Only the owner merges into upstream `main` or deploys. [Repository setup](REPOSITORY-SETUP.md) records the branch protections and CI policy.

## Concerns and changes to this document

Suggest changes to these rules in Discord or an Issue. Send private conduct concerns to `admin.betamods@gmail.com` and vulnerabilities through [Security reporting](SECURITY.md). Explain moderation and project decisions when doing so will not expose someone else's private information.
