# Beta Mods

Beta Mods is a community project for testing game mods before release. Authors share beta builds, testers report reproducible bugs, and build-specific readiness votes help authors decide what needs more work.

The site is in a small private beta. This private repository is the sole application codebase, including its existing artwork, runtime, tests, and operational tooling. There is no separate community edition or manually mirrored copy of the app.

The intended contribution model is invite-only. New repository invitations are on hold until access to backup artifacts, operational history, and production-connected workflows has been separated and verified. These documents do not mean that read-only roles, branch protection, or enforced pull-request checks are already configured. Site testers can keep providing feedback in Discord without repository access.

## What works today

- Mod listings, versioned builds, scanned screenshot galleries, requirements, and a searchable catalog.
- Email and password accounts, verification, recovery, profiles, following, and notifications.
- Build-specific bug reports and readiness votes, with permission-controlled report attachments.
- Author dashboards, moderation tools, and upload approvals and quotas for the pilot.
- A downloadable Nexus release package containing the latest scanned build, scanned gallery media, a BBCode description, summary, readme, changelog, and requirements checklist.

The release package does not publish to Nexus automatically. Authors review its contents and create their Nexus release themselves. The requirements text is a checklist for Nexus's search-and-link interface, not a field to paste wholesale.

Per-mod access codes, unlisted private betas, and individual tester invitations are proposals, not implemented features. The existing pilot access code gates the whole pilot site. Nexus sign-in and API integration remain unfinished and are not required for the current email-based beta. Beta Mods is independent of Nexus Mods.

## Technology

The application uses Next.js 16, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM, and PostgreSQL. Use Node.js 22 and the committed npm lockfile for development.

The current hosted pilot uses Render for the app, Neon for PostgreSQL, a private Supabase S3 bucket for files, Transloadit for malware scanning, and Resend for account emails. Contributors do not need accounts with those services to work on the UI or run the default checks.

Local development can use local PostgreSQL, local file storage, and a ClamAV-backed scanner. No container platform or hosted provider account is required for that setup. Older home and Oracle configurations remain in the same repository as alternatives, not instructions to change the current live service.

## Start contributing locally

After the owner has approved and safely configured your access, clone the authorized repository into a fresh directory:

```sh
git clone <authorized-repository-url> betamods
cd betamods
git switch -c <your-change-branch>
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open <http://127.0.0.1:3000>. With no `DATABASE_URL`, the app can render its public shell and empty states, but accounts, real listings, and uploads will not work. This is a useful starting point for layout and component work, not a complete running service. Do not copy a maintainer's environment files or use the live pilot as your development backend.

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

Run the database-free checks in a fresh checkout with no private environment files:

```sh
node node_modules/next/dist/bin/next typegen
npm run typecheck
npm run lint
npm test
npm run build
```

See [Contributing](CONTRIBUTING.md) for database-backed development, scanner setup, and the separate integration and end-to-end checks. Those checks can write data and are not part of the credential-free contributor CI.

## Work on the project together

Bug reports, design feedback, accessibility work, documentation, and testing are contributions too. Use Discord, or an Issue once authorized, to discuss a substantial proposal before building it. The contribution process is a focused branch, a pull request, and owner review and testing before merge. This is the intended workflow, not a claim that GitHub currently enforces it. Do not push directly to `main`, run operational workflows, or deploy without explicit owner authorization.

- [Contributing](CONTRIBUTING.md): setup, checks, and pull requests.
- [Governance](GOVERNANCE.md): how decisions and maintainer responsibilities work.
- [Security](SECURITY.md): how to report a vulnerability privately.
- [Architecture](docs/ARCHITECTURE.md): application structure and security boundaries.
- [Deployment](docs/DEPLOYMENT.md): configuration profiles and operator responsibilities.
- [Product spec](beta-mod-hub-spec.md): the project's original design and constraints. Some sections describe planned work; the status above distinguishes shipped features from proposals.

## Security and file ownership

Hosted user data, uploaded mods, and live credentials are separate from source code and must remain private. Backup workflows and their retained artifacts need additional access review before collaborators are admitted; a private repository alone is not sufficient separation.

Every upload must pass the quarantine, malware scan, and final-storage sequence. Missing or failed scans must block publication. Contributions must preserve authorization checks, private storage, quota accounting, and this fail-closed behavior.

Never attach real credentials, access codes, user exports, private mod archives, or live signed download URLs to an Issue or pull request. Use small synthetic fixtures that you have permission to share.

## Source permissions

No open-source license has been adopted. Access to this private repository does not authorize public redistribution of its code or artwork. Agree on permission with the owner before sharing it or incorporating third-party material. Uploaded mods and dependencies retain their own licenses and permissions; contributing to the website does not transfer ownership of them.
