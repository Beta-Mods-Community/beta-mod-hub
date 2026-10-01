<#
.SYNOPSIS
  Restore the home stack from a backup taken by home-backup.ps1, and audit the
  R2 bucket against a saved inventory.

.DESCRIPTION
  What can be restored, and what cannot:

    -Which neon       overwrites the contents of the Neon `main` branch. This is
                      the only thing that is genuinely restored, because
                      since R2 became final storage it is the ONLY copy of the
                      mod archives -- they are not in the backup, by design,
                      because a second copy would double storage cost and push
                      the pilot out of the free allowance.
    -Which app-data   restores the quarantine scratch volume. Only present when
                      the backup was taken with -IncludeQuarantine, and it
                      restores no user archives.
    -Which all        both, in that order (volume first, so a half-finished
                      restore never leaves new files pointing at old rows)
    -Which audit      restore nothing; only report the bucket's current
                      contents against the saved inventory. Read-only and safe
                      to run at any time.

  So if the bucket itself is lost, a restore of the database gets every listing,
  page and account back -- but the archives are gone and the mod authors have to
  re-upload. That is a deliberate trade, not an oversight: see DEPLOY-HOME.md
  "Backups" for why the bucket is not mirrored.

  Both restores are destructive and replace current state, so the stack is
  stopped first and the exact artefact is echoed before anything is written.

  Dry run by default: pass -Confirm to actually write. That is deliberate --
  "restore the database" is not a command to fire on a hunch.

.PARAMETER BackupDir
  Where the backups live. Defaults to $env:BETAMODS_BACKUP_DIR, else
  C:\betamods-backups.

.PARAMETER Stamp
  Which day's backup, e.g. 2026-09-28. Defaults to the most recent one found.

.PARAMETER Which
  Which artefact to restore: all, app-data, neon, or audit.

.PARAMETER NeonDirectUrl
  Neon DIRECT (non-pooled) connection string for the restore. Defaults to
  $env:NEON_DIRECT_URL, else NEON_DIRECT_URL from a .backup.env file beside
  the repo. Never echoed to the console.

.PARAMETER Confirm
  Actually perform the restore. Without it, only a plan is printed.
#>
[CmdletBinding()]
param(
  [string] $BackupDir,
  [string] $Stamp,
  [ValidateSet('all', 'app-data', 'neon', 'audit')]
  [string] $Which = 'all',
  [string] $NeonDirectUrl,
  [string] $BackupEnvFile,
  [switch] $Confirm
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $BackupDir) {
  if ($env:BETAMODS_BACKUP_DIR) { $BackupDir = $env:BETAMODS_BACKUP_DIR }
  else { $BackupDir = 'C:\betamods-backups' }
}
if (-not $BackupEnvFile) { $BackupEnvFile = Join-Path $RepoRoot '.backup.env' }

$ProjectName = 'betamods-home'
$AppDataVolume = "${ProjectName}_app-data"
$ComposeFile = Join-Path $RepoRoot 'compose.home.yml'
$EnvFile = Join-Path $RepoRoot '.env.home'

# Must be >= the Neon server's major version or pg_restore/pg_dump abort.
# Keep in step with $PostgresImage in home-backup.ps1.
$PostgresImage = 'postgres:18-alpine'

function Write-Step { param([string] $m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Note { param([string] $m) Write-Host "    $m" -ForegroundColor DarkGray }
function Write-Fail { param([string] $m) Write-Host "!!! $m" -ForegroundColor Red }
function Write-Plan { param([string] $m) Write-Host "  [plan] $m" -ForegroundColor Yellow }

function Get-EnvValue {
  param([string] $File, [string] $Name)
  if (-not (Test-Path $File)) { return '' }
  $m = Select-String -Path $File -Pattern "^$Name=(.*)$" | Select-Object -First 1
  if (-not $m) { return '' }
  return $m.Matches[0].Groups[1].Value.Trim()
}

$BackupDir = [System.IO.Path]::GetFullPath($BackupDir)
if (-not (Test-Path $BackupDir)) { throw "backup dir not found: $BackupDir" }

# Resolve which stamp to use.
if (-not $Stamp) {
  $stamps = @()
  foreach ($pattern in @('neon-*.dump', 'r2-inventory-*.json', 'app-data-*.tgz')) {
    $latest = Get-ChildItem -LiteralPath $BackupDir -Filter $pattern -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^(neon|r2-inventory|app-data)-\d{4}-\d{2}-\d{2}\.(dump|json|tgz)$' } |
      Sort-Object Name -Descending | Select-Object -First 1
    if ($latest) { $stamps += ($latest.Name -replace '^(neon|r2-inventory|app-data)-|\.(dump|json|tgz)$', '') }
  }
  if ($stamps.Count -eq 0) { throw "no backups found in $BackupDir" }
  $Stamp = ($stamps | Sort-Object -Descending | Select-Object -First 1)
  Write-Note "no -Stamp given; using most recent: $Stamp"
}

$tgzPath = Join-Path $BackupDir "app-data-$Stamp.tgz"
$dumpPath = Join-Path $BackupDir "neon-$Stamp.dump"

Write-Step "restore plan -- stamp $Stamp"

# --- audit: read-only, no docker needed -------------------------------------
if ($Which -eq 'audit') {
  $inventoryPath = Join-Path $BackupDir "r2-inventory-$Stamp.json"
  if (-not (Test-Path $inventoryPath)) {
    throw "no saved inventory for ${Stamp}: $inventoryPath"
  }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node not found on PATH -- cannot run scripts/r2-inventory.mjs'
  }
  Write-Step "listing the bucket now, to compare against $inventoryPath"
  $nowPath = Join-Path $BackupDir "r2-inventory-now.json"
  & node (Join-Path $RepoRoot 'scripts/r2-inventory.mjs') --out $nowPath 2>&1 |
    ForEach-Object { Write-Note "  $_" }
  if ($LASTEXITCODE -ne 0) { throw 'could not list the bucket' }

  $then = Get-Content $inventoryPath -Raw | ConvertFrom-Json
  $now = Get-Content $nowPath -Raw | ConvertFrom-Json
  $thenKeys = @{}
  foreach ($o in $then.objects) { $thenKeys[$o.key] = [int64]$o.size }
  $nowKeys = @{}
  foreach ($o in $now.objects) { $nowKeys[$o.key] = [int64]$o.size }

  $missing = @($thenKeys.Keys | Where-Object { -not $nowKeys.ContainsKey($_) } | Sort-Object)
  $added = @($nowKeys.Keys | Where-Object { -not $thenKeys.ContainsKey($_) } | Sort-Object)
  $changed = @($thenKeys.Keys | Where-Object {
    $nowKeys.ContainsKey($_) -and $nowKeys[$_] -ne $thenKeys[$_]
  } | Sort-Object)

  Write-Host ''
  Write-Host '--- bucket audit ---' -ForegroundColor Cyan
  Write-Host ("  as of $Stamp : {0} object(s), {1}" -f $then.totals.objects, $then.totals.human)
  Write-Host ("  now         : {0} object(s), {1}" -f $now.totals.objects, $now.totals.human)
  Write-Host ("  missing since then : {0}" -f $missing.Count)
  foreach ($k in $missing) { Write-Host "    MISSING $k" -ForegroundColor Red }
  Write-Host ("  added since then   : {0}" -f $added.Count)
  foreach ($k in $added) { Write-Host "    added   $k" }
  Write-Host ("  size changed       : {0}" -f $changed.Count)
  foreach ($k in $changed) { Write-Host "    changed $k" }
  if ($missing.Count -eq 0) {
    Write-Host ''
    Write-Note 'no archive from that backup is missing'
  }
  exit 0
}

# Everything below touches the stack, so docker is needed from here on.
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'docker not found on PATH -- start Docker Desktop and re-run.'
}

if ($Which -in @('all', 'app-data')) {
  if (Test-Path $tgzPath) {
    Write-Plan "overwrite volume $AppDataVolume from $tgzPath (ALL current uploaded files are replaced)"
  } else {
    Write-Fail "missing volume archive: $tgzPath"
    exit 1
  }
}
if ($Which -in @('all', 'neon')) {
  if (Test-Path $dumpPath) {
    Write-Plan "replace the CONTENTS of the Neon main branch from $dumpPath (--clean --if-exists)"
  } else {
    Write-Fail "missing database dump: $dumpPath"
    exit 1
  }
}

if (-not $Confirm) {
  Write-Host ''
  Write-Plan 'dry run only -- nothing was changed.'
  Write-Host '  Re-run with -Confirm once you are sure this is the backup you want.' -ForegroundColor Yellow
  exit 0
}

# --- stop the stack --------------------------------------------------------
Write-Step 'stopping the app so nothing writes during the restore'
& docker compose --env-file $EnvFile -f $ComposeFile down | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'could not stop the stack' }

# --- volume (quarantine scratch only) ---------------------------------------
if ($Which -in @('all', 'app-data')) {
  Write-Step "restoring volume $AppDataVolume from app-data-$Stamp.tgz"
  & docker run --rm `
    --mount "type=volume,source=$AppDataVolume,target=/data" `
    --mount "type=bind,source=$BackupDir,target=/backup,readonly" `
    alpine:3.20 sh -c "tar xzf /backup/app-data-$Stamp.tgz -C /data"
  if ($LASTEXITCODE -ne 0) { throw 'volume restore failed' }
  Write-Note 'volume restored'
}

# --- Neon ------------------------------------------------------------------
if ($Which -in @('all', 'neon')) {
  $url = $NeonDirectUrl
  if (-not $url) { $url = $env:NEON_DIRECT_URL }
  if (-not $url) { $url = Get-EnvValue -File $BackupEnvFile -Name 'NEON_DIRECT_URL' }
  if (-not $url) { throw 'no Neon DIRECT connection string available' }
  if ($url -match '(?i)-pooler\.') {
    throw 'that is a POOLED Neon URL; pg_restore needs the direct endpoint'
  }
  Write-Step "restoring the Neon main branch from neon-$Stamp.dump"
  $env:NEON_DIRECT_URL = $url
  try {
    $pgRestoreCmd = 'pg_restore --clean --if-exists --no-owner --no-privileges -d "$NEON_DIRECT_URL" "/backup/neon-{0}.dump"' -f $Stamp
    & docker run --rm `
      --env NEON_DIRECT_URL `
      --mount "type=bind,source=$BackupDir,target=/backup,readonly" `
      $PostgresImage sh -c $pgRestoreCmd
    if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed' }
  } finally {
    Remove-Item Env:\NEON_DIRECT_URL -ErrorAction SilentlyContinue
  }
  Write-Note 'database restored'
}

# --- bring it back ---------------------------------------------------------
Write-Step 'starting the stack again'
& docker compose --env-file $EnvFile -f $ComposeFile up -d | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'could not restart the stack' }

Write-Host ''
Write-Note 'the mod archives themselves were not restored -- they live in R2 and were never in the backup.'
Write-Note 'run: .\scripts\home-restore.ps1 -Which audit   to check the bucket is still intact.'
Write-Step 'restored -- verify with: .\scripts\home-stack.ps1 smoke'
