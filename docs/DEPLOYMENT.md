# Deployment configuration and responsibilities

This is a configuration overview for the existing private application repository, not a one-click deployment or permission to change the live service. Runtime code, operational scripts, and preserved deployment targets remain together in this sole app codebase. The owner controls deployment; contributor changes must be reviewed and tested before an authorized release.

New repository invitations are on hold until access to privileged workflows, operational history, and backup artifacts has been separated and verified. The credential-free contributor CI does not prove that this broader separation or branch protection is complete. Existing hosting and backup operations must not be interrupted as part of documentation or contributor setup.

## Local development profile

Start with the included `env.example` and [Contributing](../CONTRIBUTING.md). With no database URL, the app supports UI and empty-state work only. A complete local workflow needs a dedicated PostgreSQL database, local file storage, and a real ClamAV daemon and scan wrapper. No hosted provider account or container platform is required.

| Setting | Local purpose |
| --- | --- |
| `DATABASE_URL` | Your disposable PostgreSQL database, never the live service |
| `APP_URL` | Loopback origin matching the local app |
| `SESSION_SECRET` | A new local secret, separate from every deployed environment |
| `STORAGE_DRIVER=local` | Private files under the gitignored `data` directory |
| `SCAN_DRIVER=clamav` and `SCAN_ENDPOINT` | The loopback scan wrapper backed by `clamd` |
| `MALWARE_SCAN_API_KEY` and `SCAN_API_KEY` | Matching app and wrapper keys |
| `AUTH_MAIL_MODE=preview` | Development mail files outside the repository |
| `ADMIN_USER_IDS` | Explicit UUIDs for your own development administrator accounts |

Keep `CLOUD_PILOT=off`, bind the app and wrapper to loopback, and never expose mail previews or development-only authentication settings publicly. The wrapper can load local settings with `node --env-file=.env.local scripts/scan-server.mjs`.

## Bounded cloud profile

The included `start:cloud` launcher is deliberately specific. It expects a Node.js 22 production host, a Neon pooled database URL, a dedicated private Supabase S3 bucket, Transloadit scanning, and Resend email delivery. It is not a generic adapter for arbitrary providers.

An operator must supply server-side configuration privately:

| Configuration group | Required settings |
| --- | --- |
| Runtime | `NODE_ENV=production`, `CLOUD_PILOT=on`, `PILOT_MODE=on`, `STORAGE_DRIVER=s3`, `SCAN_DRIVER=transloadit`, `AUTH_MAIL_MODE=resend` |
| Database and origin | `DATABASE_URL` using an isolated Neon pooled endpoint with `sslmode=require`; `APP_URL` as the deployed HTTPS origin |
| Stable secrets | Independent `SESSION_SECRET` and `PILOT_ACCESS_KEY` of at least 32 characters; `ENCRYPTION_KEY` encoding exactly 32 random bytes in base64 |
| Private object storage | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| Scanning | `TRANSLOADIT_KEY`, `TRANSLOADIT_SECRET`, and `TRANSLOADIT_SIGNATURE_ALGORITHM` matching that key's configuration |
| Mail | `RESEND_API_KEY` and a verified `AUTH_MAIL_FROM` sender |
| Administration | Known verified account UUIDs in `ADMIN_USER_IDS`, assigned deliberately after account creation |

Set `CLOUD_PILOT=on` at build time as well as runtime. Build with `npm run build`, then start with `npm run start:cloud`; the launcher checks for the matching build. On Linux, `MALLOC_ARENA_MAX=2` must be present before Node starts. Remove `AUTH_ALLOW_UNVERIFIED_LOCAL` entirely and do not carry over mail-preview settings. The runtime receives settings from the host environment, not by automatically loading a private configuration file.

The bounded profile currently restricts files to 8 MiB, ZIP contents to 32 MiB expanded and 256 entries, images to 4,194,304 pixels, and promotion-package input to 32 MiB. It also enforces pilot storage, uploader, request, and scan-budget limits. The launcher bounds incoming request bodies and concurrent work. Raising limits is an architecture and resource-planning change, not an incidental environment tweak.

Object-storage keys are server-only. Use a dedicated project and a private bucket because these credentials can have broad access within their project. Do not place them in browser code or variables prefixed with `NEXT_PUBLIC_`.

## Before exposing any deployment

- Review and apply the schema to the intended database, with a backup and rollback plan for changes to existing data.
- Configure HTTPS, verified email delivery, stable secrets, account verification, and least-privilege administrator access.
- Confirm clean uploads, scanner failure handling, authorized downloads, and denial of private files to other accounts in an isolated test environment.
- Check the host's actual memory, request, storage, and billing limits. Application caps and budget estimates are not a promise of zero provider charges.
- Establish encrypted backups, retention, restore rehearsals, logging, updates, and incident ownership outside the credential-free contributor workflow. Verify access separation before inviting collaborators.
- Record the deployed revision and any unverified cases. A successful build or unit suite is not evidence that provider integration or disaster recovery works.

The existing `DEPLOY-CLOUD.md` describes the current hosted profile. `DEPLOY-HOME.md`, `compose.home.yml`, `DEPLOY.md`, and `compose.oracle.yml` preserve earlier alternatives; their presence is not approval to switch hosting or connect contributor machines to production. Operational scripts and integration/end-to-end tests remain in the repository but are excluded from contributor CI.

Anyone authorized to operate an instance is responsible for its security, availability, costs, privacy practices, and permission to host uploaded content. Repository access is not an open-source license or deployment authorization. Do not use the live pilot or its users as a development test environment.
