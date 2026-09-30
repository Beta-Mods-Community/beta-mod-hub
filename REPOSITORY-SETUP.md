# Private community repository setup

The existing `beta-mod-hub` repository is the only application codebase.
The local preview and the live Render pilot run revisions of this project,
with separate configuration and data. Do not create a public edition, source
export, application mirror, or a second independently edited app repository.

## Access model

Source collaboration is private and invitation-only. No open-source license
has been adopted. The source repository is not a distribution of uploaded mods,
user data, production credentials, or backups.

GitHub personal private repositories grant collaborators write access. The
intended setup transfers this same repository into an owner-controlled Free
organization so selected contributors can receive Read access, fork privately,
and submit pull requests without pushing or merging upstream. Only explicitly
trusted maintainers receive write access. Private branch protection is not
available on Free; do not describe CODEOWNERS or CI as an enforced merge gate.

An organization transfer preserves the repository and its history. It is not
a second application repository. Keep it private and verify the Render GitHub
connection after the transfer. Do not invite contributors before operational
separation is verified.

## Backup separation

The planned private `Beta-Mods/betamods-ops` repository contains backup tooling
only: its workflow, four scripts, tests and minimal dependencies. It must not
contain a copy of the website. Access stays with the owner. Application source
access never implies access to this repository or production services.

Complete the cutover in this order:

1. Validate the operations package offline and create its private repository.
2. Configure only the existing backup credentials and required repository
   variables. Do not copy application/session/mail/scanner credentials.
3. Run a manual backup, download the retained encrypted artifact, and verify
   decryption, object hashes and restoration into a disposable database.
4. Enable the new schedule, then disable the old schedule. Account for artifact
   usage across both repositories while they overlap.
5. Preserve verified recovery copies before retiring old backup artifacts and
   logs. Remove backup credentials from the application repository. Merely
   removing a workflow file does not remove secrets or retained artifacts.
6. Remove the application's active backup tooling after the new job is proven.
   Its Git history remains intact. Historical code without credentials is not
   a second maintained operations package.

Do not remove working backups before their replacement passes verification.
Do not claim separation from local files alone: repository settings, retained
artifacts, logs, secrets, variables, installed apps and deploy keys need review.

## Release workflow

Contributors propose changes against this repository. Maintainers review code,
dependency and workflow changes, run credential-free CI, and merge accepted
changes. Production remains owner-controlled. Deploy a reviewed revision of
this same repository; there is no manual copying of application code between
repositories. Never give PR workflows production secrets or auto-deploy private
forks. Database-backed and upload tests use isolated development resources,
not the live pilot.

## Current transition status

September 30, 2026: the duplicated public-source plan is retired. The exporter
and substitute community artwork/templates have been removed from the active
tree; original site artwork and all application tests remain intact. Previously
prepared work is recoverable in Git history. The sibling community draft is
not a supported working project.

GitHub access changes, operations cutover and contributor invitations are not
complete merely because this document exists. Record their verified state here
after each step. Until then the current private repository, live deployment
and working backup schedule remain the authoritative setup.
