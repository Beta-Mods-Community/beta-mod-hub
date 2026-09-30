# Beta Mods governance

Beta Mods aims to become a community-run project shaped by mod authors and testers. This document describes how work is handled now and how responsibility can be shared as the project grows. It does not claim that a community council or voting system already exists.

The project currently uses one private application repository. New contributor invitations are paused until operational access and backup exposure have been separated and verified. No organization role, read-only access model, protected branch, or enforced approval rule should be inferred from this document.

## Decisions today

The project owner remains accountable for merges, releases, moderation policy, operating costs, and the live service. Community members can propose changes in Discord, or through Issues and pull requests once access is approved. The owner should explain substantive decisions, including why a proposal is deferred or declined.

Once code access is available, small fixes can go directly to a pull request. Significant changes to user workflows, privacy, architecture, costs, or community rules should begin with a proposal shared with the relevant community, describing the problem, options, tradeoffs, and a way to evaluate the result. Gather feedback from the people affected, record the decision, and revisit it when evidence changes.

Community feedback should shape the project, but popularity alone does not override security, privacy, legal obligations, or sustainable operating limits. Emergency security work can be handled privately, followed by an appropriate public explanation once disclosure is safe.

## Ways to help

- Test changes and write reproducible reports.
- Improve design, accessibility, documentation, and onboarding.
- Contribute focused code changes and review others' work.
- Suggest testing standards and moderation practices.
- Help maintain components consistently over time.

No technical background is required to offer useful feedback. Disagree about ideas without attacking people, and keep private information out of public discussions.

## Becoming a maintainer

Maintainer access is earned through consistent, careful contributions and respectful collaboration, not bought or granted automatically with a pull request. The owner may invite a contributor into a defined role after discussing its scope and responsibilities with them.

Choose the least access needed, but first verify what the actual GitHub account and repository configuration can enforce. A read role, when available, can still expose repository history and Actions artifacts. Neither a private repository nor branch protection alone provides sufficient separation for backup data. Hosting, billing, storage, production secrets, user data, and site administration require separate explicit authorization. Responsibilities and access should be reduced or removed when no longer needed.

As more maintainers participate, the community can propose a clearer shared decision process. Any change should identify who can decide what, how disagreements are resolved, and who remains responsible for security and service operations. Until such a process is adopted, no informal poll transfers that accountability.

## Source code and hosted content

No open-source license has been adopted. Access is private and by permission; it does not authorize republication of the code, redistribution of uploaded mods, or disclosure of user data. Existing third-party licenses and authors' permissions remain unchanged. Contributors should submit material they have the right to share for incorporation into Beta Mods, and clarify restrictions before submission. No copyright transfer or separate contributor license agreement is established by this document.

Application changes belong in this one repository, not a separate community edition or a manually synchronized app mirror. The intended workflow is branch, pull request, owner review and testing, then an owner-controlled merge and deployment decision. Do not push directly to `main` or run production actions without explicit authorization. The documentation describes that policy; it does not certify that remote enforcement or operational separation is complete.

## Concerns and changes to this document

Use an Issue to propose a governance change. For a private conduct concern, contact `admin.betamods@gmail.com`; for a vulnerability, follow [Security reporting](SECURITY.md). Maintainers should avoid resolving disputes solely through unexplained deletion or private decisions when a safe public explanation is possible.
