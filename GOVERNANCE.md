# Beta Mods governance

Beta Mods aims to become a community-run project shaped by mod authors and testers. This document describes how work is handled now and how responsibility can be shared as the project grows. It does not claim that a community council or voting system already exists.

## Decisions today

The project owner remains accountable for merges, releases, moderation policy, operating costs, and the live service. Contributors can propose changes through Issues and pull requests. The owner should explain substantive decisions, including why a proposal is deferred or declined.

Small fixes can go directly to a pull request. Significant changes to user workflows, privacy, architecture, costs, or community rules should begin with a public proposal describing the problem, options, tradeoffs, and a way to evaluate the result. Gather feedback from the people affected, record the decision, and revisit it when evidence changes.

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

Start with the least access needed, such as triage or review. Repository write access does not automatically include hosting, billing, storage, production secrets, user data, or administrative access to the site. Sensitive changes still need review. Responsibilities and access should be reduced or removed when no longer needed.

As more maintainers participate, the community can propose a clearer shared decision process. Any change should identify who can decide what, how disagreements are resolved, and who remains responsible for security and service operations. Until such a process is adopted, no informal poll transfers that accountability.

## Source code and hosted content

The open-source license, once finalized in `LICENSE`, governs the website code. It does not transfer ownership of uploaded mods, grant permission to redistribute private files, or make user data public. Contributions to the website must respect authors' separate permissions and third-party licenses.

The public source project and the operation of a live website are separate responsibilities. Code is proposed in forks and pull requests, reviewed, tested, and merged by maintainers. Deployment follows a separate controlled process. Community members do not push directly to production or receive production credentials to contribute.

## Concerns and changes to this document

Use an Issue to propose a governance change. For a private conduct concern, contact `admin.betamods@gmail.com`; for a vulnerability, follow [Security reporting](SECURITY.md). Maintainers should avoid resolving disputes solely through unexplained deletion or private decisions when a safe public explanation is possible.
