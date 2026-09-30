# Windows local preview

For a new contributor setup, start with [Contributing](CONTRIBUTING.md).
The Windows launcher is an optional workflow for an already configured native
ClamAV installation, development database, and capped R2 bucket. It is not a
production server and is not needed to use [the hosted site](https://betamods.com).

Double-click **Launch Beta Mods.cmd** to start the configured ClamAV daemon,
scan wrapper, and Next.js preview. It checks health and opens
`http://127.0.0.1:3000`. **Stop Beta Mods.cmd** stops only processes recorded
by the launcher; unrelated processes are left alone. Docker is not required.

## Prerequisites and environment

The launcher expects Node on PATH and ClamAV under
`%USERPROFILE%\ClamAV`, with `clamd.conf` and downloaded signatures. ClamAV
must explicitly bind `TCPAddr` to `127.0.0.1` or `::1`.

`scripts/local-service.mjs` reads `.env.local` and `.env.home`, merging
home settings over local settings except for the database URL. If both files
have a database URL, their normalized endpoints must agree. The database guard
also compares against `.env.production`. These checks help prevent mistakes;
you must still verify that credentials belong to a disposable development
database and bucket.

The launcher requires the R2 endpoint/bucket/access/secret values,
`SESSION_SECRET`, and `SCAN_API_KEY`. It forces R2 storage, pilot mode,
loopback endpoints, and local mail previews. It does not load
`.env.cloud.local`, create a tunnel, change DNS, or modify the hosted service.

Accepted files are scanned and stored in the configured R2 bucket; temporary
quarantine is local. This preview can consume real provider quota. Application
caps are not a Cloudflare billing limit. Ordinary contributors can avoid R2
by following the local-storage setup in Contributing instead.

## Account testing

Verification and recovery messages are written privately under
`%USERPROFILE%\.betamods-dev-mail`; no real mail is sent by this profile.
The launcher allows unverified-account writes only in loopback development.
It does not mark accounts verified. Never reuse that exception or mail-preview
configuration in a public deployment.

Set administrator UUIDs deliberately. See [Account setup](ACCOUNT-SETUP.md).

## Commands and diagnostics

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-preview.ps1 start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-preview.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local-preview.ps1 stop
```

Logs and process identities are under
`%LOCALAPPDATA%\BetaMods\local-preview`. If an unrelated server occupies
port 3000 or 3311, the launcher reports a conflict instead of killing it.
Non-loopback listeners on the app/scanner ports also prevent startup.

To compile separately from the running preview:

```powershell
$previousBuildCheck = $env:BETAMODS_BUILD_CHECK
try {
  $env:BETAMODS_BUILD_CHECK = '1'
  npm.cmd run build
} finally {
  $env:BETAMODS_BUILD_CHECK = $previousBuildCheck
}
```

This uses ignored `.next-check` rather than the preview's `.next` directory.

## Upload regression check

The launcher forces R2 and pilot mode. Select matching settings explicitly:

```powershell
$previousE2eEnvFile = $env:E2E_ENV_FILE
$previousE2eDriver = $env:E2E_STORAGE_DRIVER
try {
  $env:E2E_ENV_FILE = '.env.home'
  $env:E2E_STORAGE_DRIVER = 'r2'
  npm.cmd run e2e
} finally {
  $env:E2E_ENV_FILE = $previousE2eEnvFile
  $env:E2E_STORAGE_DRIVER = $previousE2eDriver
}
```

Run only against the isolated preview configuration. The suite temporarily
changes upload controls and test approval metadata, writes files and rows,
then attempts restoration in `finally`. Do not run it concurrently with
uploads, other mutation suites, or administrator changes. Review failures and
cleanup rather than rerunning blindly.

The report prints selected configuration, skipped groups, and passed/total
checks. R2 alone does not imply pilot coverage; `PILOT_MODE` must also be on.
Storage-cap concurrency tests belong to the integration suite.

## Deployment is separate

Do not publish this development server through a tunnel. Real deployments need
their own stable secrets, verified email, database/schema review, scanning,
backup/restore checks, and HTTPS configuration. Use
[Deployment profiles](docs/DEPLOYMENT.md); the current official service is the
cloud profile, not this PC.
