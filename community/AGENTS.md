# Contributor instructions

Read README.md, CONTRIBUTING.md and beta-mod-hub-spec.md first. The spec records
product intent; the implementation and documented limitations determine what
currently works. Do not claim planned integrations are available.

## Development

Use Node.js 22 and npm ci. On Windows use npm.cmd if PowerShell blocks npm.ps1.
Read the version-matched Next.js documentation in node_modules/next/dist/docs
before changing framework-specific code. This project uses the App Router,
TypeScript, Tailwind CSS and Drizzle with PostgreSQL.

Run npm test, npm run lint, route type generation and npm run typecheck before
handing off changes. Build both default and CLOUD_PILOT=on profiles with
BETAMODS_BUILD_CHECK=1 to avoid overwriting a running development build.
The Contributor checks workflow documents the exact commands.

Never connect contributor tests to the live service, a maintainer database or
production storage. Use your own empty development database and test accounts.
Do not request production credentials. Do not disable security controls to make
a test pass. Keep db/schema.ts, related schema modules and schema.sql in sync.

## Security and scope

Uploads must follow quarantine, malware scan, then authorized storage and
serving. Scanning fails closed in development as well as production. Private
report attachments require their own authorization. Public code does not make
user content public or grant rights to redistribute uploaded mods.

Keep credentials and personal information out of code, issues, logs, screenshots
and pull requests. Use SECURITY.md to report vulnerabilities privately. Do not
run untrusted contributor code with privileged credentials or on a production
runner. Do not bypass endpoint protection or browser security warnings.

Do not automate Nexus Mods through its website. Integration must use authorized
APIs. The promotion package assists manual publication; it does not publish to
Nexus automatically. Do not change authentication or upload limits incidentally
while polishing UI or documentation.

## Collaboration

Make focused changes and add relevant tests. Preserve other contributors' work.
Use branches and pull requests. Deployment and production operations belong to
maintainers and are not triggered by community pull requests. Explain behavior
changes and limitations rather than declaring an untested feature complete.
