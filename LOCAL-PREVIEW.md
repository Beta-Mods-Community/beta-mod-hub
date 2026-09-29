# Opening the site on this PC

Double-click **Launch Beta Mods.cmd** in the project folder. It starts the
existing ClamAV, scan service and Next.js preview, checks their health, then
opens http://127.0.0.1:3000. Use **Stop Beta Mods.cmd** to stop processes started
by this launcher. It does not terminate unrelated processes or require Docker.

The launcher refuses production database endpoints and binds the web and scan
services to loopback. It uses the dev database in `.env.local` and the existing
bucket-scoped R2 credentials from `.env.home`. These env files must still point
at the same dev database. It does not create a tunnel, modify DNS or make the
site public. The laptop must be on while using this preview.

Accepted files are still scanned and stored in the existing R2 bucket, not
permanently hosted from this PC. Temporary quarantine files live under `data/`.
Pilot account approval, storage caps and upload rate limits remain enabled.
These app limits are not a billing cap on the Cloudflare account.

Local account recovery writes private mail-preview files to
`%USERPROFILE%\.betamods-dev-mail`. It does not send real email. Public writes
from unverified accounts are explicitly allowed in this loopback development
mode only; accounts are **not** silently marked verified. Production rejects
this bypass and requires real email verification. See `ACCOUNT-SETUP.md`.

## Commands and diagnostics

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-preview.ps1 start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-preview.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-preview.ps1 stop
```

Logs and managed-process identities are stored in
`%LOCALAPPDATA%\BetaMods\local-preview`. If another server already owns ports
3000/3311, the launcher stops with an explanation rather than killing it.
The launcher does not repair Docker Desktop or promise production uptime.

OneDrive can lock older Next build cache entries. For an isolated production
compilation without touching a running preview:

```powershell
$env:BETAMODS_BUILD_CHECK='1'
npm run build
Remove-Item Env:BETAMODS_BUILD_CHECK
```

This uses `.next-check` instead of `.next`. Neither contains source data;
both are gitignored. Normal container builds keep `.next`.

## Upload-pipeline regression check

The native preview forces R2 storage and pilot mode on. The upload e2e script
defaults to `.env.local`, which can describe a different configuration. For
this preview, explicitly select the private `.env.home` configuration and R2:

```powershell
$previousE2eEnvFile = $env:E2E_ENV_FILE
$previousE2eDriver = $env:E2E_STORAGE_DRIVER
try {
  $env:E2E_ENV_FILE='.env.home'
  $env:E2E_STORAGE_DRIVER='r2'
  npm.cmd run e2e
} finally {
  $env:E2E_ENV_FILE = $previousE2eEnvFile
  $env:E2E_STORAGE_DRIVER = $previousE2eDriver
}
```

The production-endpoint guard still runs before connecting. Do not point this
test at production or run it concurrently with uploads, other mutation suites,
or admin approval/switch changes: it temporarily toggles shared upload controls
and uses the existing demo fixture. It restores the original switch row and
approval metadata in `finally`, including an originally missing switch row.

A complete R2 + pilot-on run has **29 checks**. R2 + pilot-off has 23;
local + pilot-on has 25; local + pilot-off has 19. The output prints the selected
configuration, explicit skipped groups, and exact passed/total counts. Setting
only `E2E_STORAGE_DRIVER=r2` does not turn on pilot coverage. Storage-cap race
coverage is in the separate integration suite, not these HTTP checks.

## Before a public pilot

- Configure a real HTTPS `APP_URL` and SMTP delivery; test reset and verification
  using an actual inbox. Do not expose this development server through a tunnel.
- Set explicit `ADMIN_USER_IDS`; email address alone never grants administrator access.
- Review/apply migrations `0004`–`0006` to production deliberately. The local
  migration runner refuses the production endpoint, including pooled/direct aliases.
- Rebuild and verify the production Docker target when Docker is working.
- Rehearse database backup/restore in an isolated destination. R2 inventory is
  an audit record, not an archive backup; losing an object requires a re-upload.
- Configure deployment health monitoring, then enable the tunnel/DNS only after
  explicit launch approval. Real Nexus OAuth remains a separate integration.
