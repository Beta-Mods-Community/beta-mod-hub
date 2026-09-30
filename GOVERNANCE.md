# Beta Mods governance

The goal is for authors and testers to help shape and run Beta Mods. For now, the owner makes the final decisions and is responsible for the site. There is no community council or formal voting system yet.

The app has one private repository, [Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub). Backups run separately in the owner-only `Beta-Mods/betamods-ops` repository. Access settings have been checked and private forks are enabled. The owner can invite approved contributors; nobody has been invited yet. See [Repository setup](REPOSITORY-SETUP.md).

## Decisions today

Suggest changes in Discord, or through Issues and pull requests once access is approved. The owner handles merges, releases, moderation, costs, and hosting, and should explain why larger proposals are accepted, deferred, or declined.

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

As people contribute regularly, the owner may invite them to maintain a part of the project. Agree on the work and access involved before granting permissions.

Grant only the access needed and check what GitHub actually enforces. Read access can expose history and Actions artifacts, so branch protection alone does not protect backup data. Hosting, billing, storage, secrets, user data, and site administration need separate permission. Remove access when it is no longer needed.

With more maintainers, we can agree on shared decision-making. That agreement should say who decides what, how disputes are resolved, and who handles security and hosting. Until then, the owner remains responsible; an informal poll does not transfer that responsibility.

## Source code and hosted content

No open-source license has been adopted. Repository access does not permit republication of the code, redistribution of mods, or disclosure of user data. Dependencies and uploaded mods keep their existing licenses and permissions. Submit only work you have the right to contribute for use in Beta Mods, and explain restrictions first. This guide does not transfer copyright or create a separate contributor license agreement.

Submit app changes from a private fork and branch through a pull request to this repository. The owner reviews and tests the work before merging or deploying. Private-fork Actions are disabled, so the owner tests reviewed changes locally or manually runs checks on an owner-controlled branch. Do not merge just to trigger tests. Branch protection is unavailable on the current Free plan, so review and merge decisions remain manual. Do not push directly to upstream `main` or run production commands without permission.

## Concerns and changes to this document

Suggest changes to these rules in Discord or an Issue. Send private conduct concerns to `admin.betamods@gmail.com` and vulnerabilities through [Security reporting](SECURITY.md). Explain moderation and project decisions when doing so will not expose someone else's private information.
