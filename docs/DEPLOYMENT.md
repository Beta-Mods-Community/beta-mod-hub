# Deployment settings

This guide explains local and cloud settings. It is not permission to change the live service. The owner reviews changes and decides when to deploy them.

Application source is public at [Beta-Mods-Community/beta-mod-hub](https://github.com/Beta-Mods-Community/beta-mod-hub). Production data and credentials remain private. Nightly backups run in the private, owner-only `Beta-Mods/betamods-ops` repository; the restore rehearsal recovered all 19 tables. The app repository's old backup secrets and backup runs have been removed. See [Repository setup](../REPOSITORY-SETUP.md) for contribution and protection settings.

Fork CI needs owner review and approval before execution and runs without service secrets or write tokens. Render preview deployments remain off. The merge policy requires a pull request, passing `Validate (default)` and `Validate (cloud)` checks, and owner code review. Only the owner merges and deploys; do not merge into `main` just to trigger tests. Public source does not change the site's access gate or deploy a new revision.

## Local development profile

Start with `env.example` and [Contributing](../CONTRIBUTING.md). Without a database URL, you can work on the UI and empty states. A full local setup needs PostgreSQL, local file storage, ClamAV, and the scan wrapper. It does not need Docker or provider accounts.

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

`start:cloud` expects Node.js 22, a Neon pooled database URL, a dedicated private Supabase S3 bucket, Transloadit, and Resend. It will not accept an arbitrary replacement provider without code changes.

Set these in the host's private environment settings:

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

The cloud profile limits files to 8 MiB, expanded ZIP contents to 32 MiB and 256 entries, images to 4,194,304 pixels, and release-package input to 32 MiB. Storage, uploaders, requests, and scan usage have separate limits. The launcher also limits request bodies and concurrent work. Review memory and cost requirements before proposing higher limits; do not raise them to get around a failed upload.

Storage keys stay on the server. Use a dedicated project and private bucket because these keys can access more than one bucket within a project. Never put them in browser code or `NEXT_PUBLIC_` variables.

## Before exposing any deployment

- Review and apply the schema to the intended database, with a backup and rollback plan for changes to existing data.
- Configure HTTPS, verified email delivery, stable secrets, account verification, and least-privilege administrator access.
- Confirm clean uploads, scanner failure handling, authorized downloads, and denial of private files to other accounts in an isolated test environment.
- Check the host's actual memory, request, storage, and billing limits. Application caps and budget estimates are not a promise of zero provider charges.
- Set up encrypted backups, retention, restore tests, logs, updates, and someone responsible for incidents. Keep backup access separate from contributor CI.
- Record the deployed revision and any unverified cases. A successful build or unit suite is not evidence that provider integration or disaster recovery works.

Use `DEPLOY-CLOUD.md` for the current hosted setup. `DEPLOY-HOME.md`, `compose.home.yml`, `DEPLOY.md`, and `compose.oracle.yml` cover older alternatives, not the live site. Do not switch targets or connect a development machine to production without permission. Integration, end-to-end, and production scripts run separately from contributor CI.

Whoever runs an instance is responsible for its security, availability, costs, privacy, and permission to host its content. Repository access is not an open-source license or permission to deploy. Do not use the live pilot as a development test environment.
