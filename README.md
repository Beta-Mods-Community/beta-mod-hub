# Beta Mods

Beta Mods is a community project for testing game mods before release. Authors share beta builds, testers report reproducible bugs, and build-specific readiness votes help authors decide what needs more work.

The site is in a small private beta. This community repository contains the website software, not the hosted database, uploaded mods, private reports, account details, or production credentials. Private deployment history, operational workflows, and backup artifacts are not part of this source snapshot. Publishing the website's source does not change the ownership or permissions of any author's mod.

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

Local development can use local PostgreSQL, local file storage, and a ClamAV-backed scanner. No container platform or hosted provider account is required for that setup. Legacy hosting configurations are not included in this community edition. Merging a change here does not deploy it to the live pilot.

The community edition uses geometric SVG artwork instead of the live site's illustration and icon. See [Source and asset scope](ASSETS.md) for the boundary between project code, artwork, dependencies, and user content.

## Start contributing locally

Fork this repository, then clone your fork into a fresh directory:

```sh
git clone <your-fork-url> betamods
cd betamods
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

See [Contributing](CONTRIBUTING.md) for database-backed development, scanner setup, and the limits of the included test suite.

## Work on the project together

Bug reports, design feedback, accessibility work, documentation, and testing are contributions too. Use an Issue to explain a problem or discuss a substantial proposal before building it. Submit code through a branch in your fork and a pull request. Maintainers review and test changes before merging; a contribution does not grant production access or permission to deploy.

- [Contributing](CONTRIBUTING.md): setup, checks, and pull requests.
- [Governance](GOVERNANCE.md): how decisions and maintainer responsibilities work.
- [Security](SECURITY.md): how to report a vulnerability privately.
- [Architecture](docs/ARCHITECTURE.md): application structure and security boundaries.
- [Deployment](docs/DEPLOYMENT.md): configuration profiles and operator responsibilities.
- [Product spec](beta-mod-hub-spec.md): the project's original design and constraints. Some sections describe planned work; the status above distinguishes shipped features from proposals.

## Security and file ownership

Every upload must pass the quarantine, malware scan, and final-storage sequence. Missing or failed scans must block publication. Contributions must preserve authorization checks, private storage, quota accounting, and this fail-closed behavior.

Never attach real credentials, access codes, user exports, private mod archives, or live signed download URLs to an Issue or pull request. Use small synthetic fixtures that you have permission to share.

## License

The project intends to publish under an open-source license. The license selection is being finalized; the repository's `LICENSE` file, once adopted, will define the granted rights. Until it is present, do not assume that public visibility alone grants a license to reuse the code. Uploaded mods and third-party dependencies retain their own licenses and permissions.
