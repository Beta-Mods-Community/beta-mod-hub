# Deployment profiles

For development, start with [Contributing](../CONTRIBUTING.md). The live site
uses the bounded cloud profile. The home and Oracle configurations are optional
alternatives and are not part of the hosted service.

| Profile | Runtime and storage | Guide |
| --- | --- | --- |
| Contributor development | Local Node, disposable PostgreSQL, local files, ClamAV | [Contributing](../CONTRIBUTING.md) |
| Windows preview | Native Node and ClamAV, development database, capped R2 | [Local preview](../LOCAL-PREVIEW.md) |
| Current cloud pilot | Render Node 22, Neon, private Supabase S3, Transloadit, Resend | [Cloud operations](../DEPLOY-CLOUD.md) |
| Optional home hosting | Docker Desktop, R2, ClamAV, opt-in Cloudflare Tunnel | [Home deployment](../DEPLOY-HOME.md) |
| Optional Oracle hosting | Linux Compose, local persistent storage, ClamAV, Caddy | [Oracle deployment](../DEPLOY.md) |

Repository access does not grant access to hosted data or permission to deploy.
Only the owner merges and deploys the official service. Automatic deploys and
pull-request previews are disabled.

## Local configuration

Copy `env.example` to your private `.env.local`. Without a database URL, the
app can render UI and empty states. A complete local workflow needs PostgreSQL,
ClamAV, and the scan wrapper; provider accounts are not required.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Disposable development database, never the hosted service |
| `APP_URL` | Loopback origin matching the local server |
| `SESSION_SECRET` | A new local secret, not a deployed secret |
| `STORAGE_DRIVER=local` | Files under the gitignored `data` directory |
| `SCAN_DRIVER=clamav`, `SCAN_ENDPOINT` | Loopback wrapper backed by `clamd` |
| `MALWARE_SCAN_API_KEY`, `SCAN_API_KEY` | Matching application and wrapper keys |
| `AUTH_MAIL_MODE=preview` | Private local mail previews |
| `ADMIN_USER_IDS` | Deliberately selected development account UUIDs |

Keep `CLOUD_PILOT=off` and bind the web server, wrapper, and ClamAV to loopback.
Never expose development authentication exceptions or mail previews publicly.
The wrapper can load settings with
`node --env-file=.env.local scripts/scan-server.mjs`.

## Cloud configuration

Use `.env.cloud.example` for names and defaults. Real values belong in the
host's private environment settings. `.env.cloud.local` is an optional ignored
operator preparation file; the runtime does not load it automatically.

| Group | Required settings |
| --- | --- |
| Modes | `NODE_ENV=production`, `CLOUD_PILOT=on`, `PILOT_MODE=on`, `STORAGE_DRIVER=s3`, `SCAN_DRIVER=transloadit`, `AUTH_MAIL_MODE=resend` |
| Database/origin | Isolated Neon pooled `DATABASE_URL` with `sslmode=require`; canonical HTTPS `APP_URL` |
| Secrets | Independent `SESSION_SECRET` and `PILOT_ACCESS_KEY` of at least 32 characters; `ENCRYPTION_KEY` as 32 random bytes encoded in base64 |
| Storage | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| Scanning | `TRANSLOADIT_KEY`, `TRANSLOADIT_SECRET`, matching `TRANSLOADIT_SIGNATURE_ALGORITHM` |
| Mail | Sending-only `RESEND_API_KEY` and verified `AUTH_MAIL_FROM` |
| Administration | Verified account UUIDs in `ADMIN_USER_IDS` |

Set `CLOUD_PILOT=on` at build and runtime. Build with `npm run build` and start
with `MALLOC_ARENA_MAX=2 npm run start:cloud` on Linux. The launcher checks for
the cloud build's 9 MiB form limit. It is not interchangeable with `next start`.
Remove `AUTH_ALLOW_UNVERIFIED_LOCAL` and preview mail settings from this profile.

Storage keys must stay server-side and must never use `NEXT_PUBLIC_` names.
Use a dedicated private storage project because its S3 credentials have
project-wide access. Do not enable Nexus integration merely by filling its
environment variables; the implementation remains unvalidated.

## Release checklist

- Review schema changes and identify the exact target database. Back up existing
  data and establish a rollback plan before any migration.
- Configure HTTPS, stable secrets, verified mail delivery, and explicit admin
  UUIDs. Check verification and recovery with a real test inbox.
- Verify clean uploads, scanner failure handling, authorized downloads, and
  cross-account denial of private attachments in an isolated environment.
- Check memory, storage, request, and provider billing limits. Application
  quotas and budget alerts are not provider-enforced spending caps.
- Configure encrypted backups, retention, restore checks, logs, and an incident
  contact. Keep backup credentials separate from contributor CI.
- Record the deployed revision, checks performed, and unresolved cases. A green
  unit suite does not prove live provider integration or disaster recovery.

Do not run integration, end-to-end, migration, or recovery scripts against the
live site as ordinary contributor checks. Use a disposable database and bucket.
Operators are responsible for costs, availability, privacy, and permission to
host uploaded content.
