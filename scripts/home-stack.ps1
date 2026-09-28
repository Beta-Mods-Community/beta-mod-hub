<#
.SYNOPSIS
  Windows front-end for the betamods home-hosting stack (compose.home.yml).

.DESCRIPTION
  Every command runs Docker Compose with `--env-file .env.home`, which is what
  feeds the ${...} interpolation the compose file depends on. Use this rather
  than calling `docker compose` by hand -- a bare `docker compose -f
  compose.home.yml up` would interpolate from the wrong environment and either
  fail on SCAN_API_KEY or hand the app a blank scan key.

  Day-to-day:
    .\scripts\home-stack.ps1 up              start (or resume) the stack
    .\scripts\home-stack.ps1 status          what is running / healthy
    .\scripts\home-stack.ps1 logs -Service app
    .\scripts\home-stack.ps1 down            stop, keep volumes
    .\scripts\home-stack.ps1 backup          volume tarball + Neon dump
    .\scripts\home-stack.ps1 restore -Which app-data -Stamp 2026-09-28

  The tunnel stays off until you create it -- see tunnel-up.

.PARAMETER Command
  The operation to perform.

.PARAMETER Service
  Limit logs to specific services.

.PARAMETER Build
  Rebuild images before up.

.PARAMETER Full
  For `smoke`: also drive the real upload pipeline (needs -OwnerEmail).

.PARAMETER OwnerEmail
  Owner account whose existing Beta Mod hosts the --full upload check.

.PARAMETER BackupDir
  Where backups are written. Defaults to $env:BETAMODS_BACKUP_DIR, else
  C:\betamods-backups. Keep it OUTSIDE this repo and out of OneDrive.

.PARAMETER Which
  For `restore`: which artefact to restore (all, app-data, or neon).

.PARAMETER Timestamp
  For `restore`: the backup's date stamp, e.g. 2026-09-28.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet(
    'up', 'down', 'restart', 'ps', 'logs', 'config', 'build', 'status',
    'verify', 'smoke', 'backup', 'restore', 'tunnel-up', 'tunnel-down'
  )]
  [string] $Command = 'status',

  [string[]] $Service = @(),

  [switch] $Build,
  [switch] $Full,
  [string] $OwnerEmail,

  [string] $BackupDir,
  [ValidateSet('all', 'app-data', 'neon')]
  [string] $Which = 'all',
  [string] $Timestamp
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ComposeFile = Join-Path $RepoRoot 'compose.home.yml'
$LocalTestFile = Join-Path $RepoRoot 'compose.home.localtest.yml'
$EnvFile = Join-Path $RepoRoot '.env.home'

# Services that must run, and those that must additionally report healthy.
# cloudflared is absent on purpose: it only exists once the tunnel profile is
# enabled, and its distroless image has no healthcheck to read.
$SmokeServices = 'app,clamav,scan-server'
$SmokeHealthy = 'app,clamav,scan-server'

function Write-Step { param([string] $Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Note { param([string] $Message) Write-Host "    $Message" -ForegroundColor DarkGray }
function Write-Fail { param([string] $Message) Write-Host "!!! $Message" -ForegroundColor Red }

function Get-ComposeArgs {
  <#
    .SYNOPSIS
      The shared `docker compose` argument prefix.
    .DESCRIPTION
      --env-file is mandatory here, not optional: it is what SCAN_API_KEY and
      CLOUDFLARE_TUNNEL_TOKEN are interpolated from.
  #>
  param(
    [switch] $LocalTest,
    [switch] $Tunnel
  )
  $composeArgs = @('compose', '--env-file', $EnvFile, '-f', $ComposeFile)
  if ($LocalTest) { $composeArgs += @('-f', $LocalTestFile) }
  if ($Tunnel) { $composeArgs += @('--profile', 'tunnel') }
  return $composeArgs
}

function Invoke-Compose {
  <#
    .SYNOPSIS
      Run docker compose, echoing output to the host. Throws on failure.
    .DESCRIPTION
      Output deliberately goes to the host rather than down the PowerShell
      pipeline, so callers get a clean boolean/error instead of a mixed array.
  #>
  param(
    [string[]] $ComposeArgs,
    [string[]] $ComposeCommand
  )
  & docker @ComposeArgs @ComposeCommand | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($ComposeCommand -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Assert-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw @"
docker was not found on PATH.

  Install Docker Desktop with the WSL2 backend, then re-run from a shell opened
  after the install finished. See DEPLOY-HOME.md "Prerequisites".
"@
  }
  & docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw @"
The Docker engine is not responding.

  Start Docker Desktop and wait for it to report "running", then re-run. A
  stopped engine is also why the up command may appear to do nothing.
"@
  }
}

function Assert-EnvFile {
  if (-not (Test-Path $EnvFile)) {
    throw @"
.env.home not found in $RepoRoot

  Copy .env.home.example to .env.home, fill in DATABASE_URL, SESSION_SECRET
  and SCAN_API_KEY, then re-run. See DEPLOY-HOME.md "First bring-up".
"@
  }
}

function Get-DefaultBackupDir {
  if ($BackupDir) { return $BackupDir }
  if ($env:BETAMODS_BACKUP_DIR) { return $env:BETAMODS_BACKUP_DIR }
  return 'C:\betamods-backups'
}

function Resolve-BackupDir {
  param([string] $Dir)
  $full = [System.IO.Path]::GetFullPath($Dir)
  # A bind mount out of a OneDrive-synced folder is slow, can fail on file
  # locking, and has no reason to sync a large tarball. Refuse rather than
  # quietly produce a flaky backup.
  if ($full -match '(?i)\\OneDrive(\\|$)') {
    throw "BackupDir is inside OneDrive ($full). Point it at a plain local folder such as C:\betamods-backups."
  }
  if (-not (Test-Path $full)) {
    New-Item -ItemType Directory -Path $full -Force | Out-Null
    Write-Note "created backup dir $full"
  }
  return $full
}

function Wait-Healthy {
  <#
    .SYNOPSIS
      Block until every named service is running + healthy. Returns $true/$false.
    .DESCRIPTION
      ClamAV's first boot downloads its signature database, so this can take
      several minutes on a fresh volume. A timeout prints current state and
      returns $false rather than hanging silently.
  #>
  param(
    [string[]] $ComposeArgs,
    [string[]] $Names,
    [int] $TimeoutSeconds = 480
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $rows = @()
    $json = & docker @ComposeArgs ps --format json 2>&1
    if ($LASTEXITCODE -eq 0) {
      foreach ($line in $json) {
        if (-not $line) { continue }
        try { $rows += ($line | ConvertFrom-Json) } catch { }
      }
    }
    $pending = @()
    foreach ($name in $Names) {
      $row = $rows | Where-Object { $_.Service -eq $name } | Select-Object -First 1
      if (-not $row) { $pending += "$name (absent)"; continue }
      if ($row.State -ne 'running') { $pending += "$name ($($row.State))"; continue }
      if ($row.Health -ne 'healthy') { $pending += "$name ($($row.Health))" }
    }
    if ($pending.Count -eq 0) {
      Write-Note "healthy: $($Names -join ', ')"
      return $true
    }
    Write-Note "waiting on: $($pending -join ', ')"
    Start-Sleep -Seconds 10
  }
  Write-Fail "timed out after ${TimeoutSeconds}s waiting for: $($Names -join ', ')"
  & docker @ComposeArgs ps | Out-Host
  return $false
}

function Invoke-Smoke {
  <#
    .SYNOPSIS
      Run scripts/smoke-prod.mjs against the home stack. Returns $true/$false.
  #>
  param([switch] $FullLoop)
  Write-Step 'production smoke check'

  $smoke = Join-Path $RepoRoot 'scripts\smoke-prod.mjs'
  # Restore process env afterwards so a smoke run cannot quietly change how the
  # rest of the session behaves.
  $saved = @{}
  $set = {
    param([string] $Name, [string] $Value)
    $saved[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process')
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
  }
  $unset = {
    param([string] $Name)
    [Environment]::SetEnvironmentVariable($Name, $saved[$Name], 'Process')
  }

  & $set 'SMOKE_ENV_FILE' $EnvFile
  & $set 'SMOKE_COMPOSE_FILE' $ComposeFile
  & $set 'SMOKE_SERVICES' $SmokeServices
  & $set 'SMOKE_HEALTHY_SERVICES' $SmokeHealthy
  & $set 'SMOKE_STORAGE_DRIVER' 'r2'
  # The scan wrapper's Compose-network name cannot be resolved from the host,
  # so probe the loopback publish provided by compose.home.localtest.yml.
  & $set 'SMOKE_SCAN_ENDPOINT' 'http://127.0.0.1:3311'
  & $set 'SMOKE_BASE_URL' 'http://127.0.0.1:3000'
  if ($FullLoop) {
    if (-not $OwnerEmail) {
      throw '-Full needs -OwnerEmail (the account that owns an existing Beta Mod)'
    }
    & $set 'SMOKE_OWNER_EMAIL' $OwnerEmail
  }

  try {
    $smokeArgs = @($smoke)
    if ($FullLoop) { $smokeArgs += '--full' }
    & node @smokeArgs | Out-Host
    return ($LASTEXITCODE -eq 0)
  } finally {
    foreach ($key in $saved.Keys) { & $unset $key }
  }
}

# --- dispatch ---------------------------------------------------------------

try {
  switch ($Command) {
    'config' {
      Assert-Docker
      Assert-EnvFile
      Write-Step 'validating compose.home.yml'
      Invoke-Compose (Get-ComposeArgs) @('config', '--quiet')
      Write-Step 'validating compose.home.yml + localtest overlay'
      Invoke-Compose (Get-ComposeArgs -LocalTest) @('config', '--quiet')
      Write-Note 'both compose files are valid'
    }

    'build' {
      Assert-Docker
      Assert-EnvFile
      Write-Step 'building images'
      Invoke-Compose (Get-ComposeArgs) @('build')
    }

    'up' {
      Assert-Docker
      Assert-EnvFile
      $ca = Get-ComposeArgs
      $upArgs = @('up', '-d')
      if ($Build) { $upArgs += '--build' }
      Write-Step 'starting clamav -> scan-server -> app (tunnel stays off)'
      Invoke-Compose $ca $upArgs
      if (-not (Wait-Healthy -ComposeArgs $ca -Names @('clamav', 'scan-server', 'app'))) {
        throw 'stack did not become healthy; run `logs` before publishing anything'
      }
      Invoke-Compose $ca @('ps')
    }

    'down' {
      Assert-Docker
      Assert-EnvFile
      Write-Step 'stopping the stack (volumes are kept -- backups are the only way to drop them safely)'
      Invoke-Compose (Get-ComposeArgs -Tunnel) @('down')
    }

    'restart' {
      Assert-Docker
      Assert-EnvFile
      $ca = Get-ComposeArgs
      Invoke-Compose $ca @('restart')
      if (-not (Wait-Healthy -ComposeArgs $ca -Names @('clamav', 'scan-server', 'app'))) {
        throw 'stack did not return to healthy'
      }
    }

    'ps' {
      Assert-Docker
      Assert-EnvFile
      Invoke-Compose (Get-ComposeArgs -Tunnel) @('ps')
    }

    'status' {
      Assert-Docker
      Assert-EnvFile
      Invoke-Compose (Get-ComposeArgs -Tunnel) @('ps')
      Write-Note 'no published ports: the only inbound path is the Cloudflare Tunnel'
    }

    'logs' {
      Assert-Docker
      Assert-EnvFile
      $logArgs = @('logs', '--tail=200')
      if ($Service) { $logArgs += $Service }
      Invoke-Compose (Get-ComposeArgs -Tunnel) $logArgs
    }

    'verify' {
      # The gate that runs before any tunnel exists: validate, build, boot on
      # loopback, wait for the whole chain to go healthy, then smoke it.
      Assert-Docker
      Assert-EnvFile
      $prod = Get-ComposeArgs
      $local = Get-ComposeArgs -LocalTest

      Write-Step '1/5 validating compose files'
      Invoke-Compose $prod @('config', '--quiet')
      Invoke-Compose $local @('config', '--quiet')
      Write-Note 'compose files are valid'

      Write-Step '2/5 building images'
      Invoke-Compose $prod @('build')

      Write-Step '3/5 starting the stack on loopback-only verification ports'
      Invoke-Compose $local @('up', '-d')

      Write-Step '4/5 waiting for clamav -> scan-server -> app to go healthy'
      if (-not (Wait-Healthy -ComposeArgs $local -Names @('clamav', 'scan-server', 'app'))) {
        throw 'stack did not become healthy; inspect `logs` before publishing anything'
      }

      Write-Step '5/5 smoke check'
      $ok = Invoke-Smoke
      Invoke-Compose $local @('ps')
      if (-not $ok) { throw 'smoke check failed' }
      Write-Step 'verified on loopback only -- no tunnel created, no DNS touched'
    }

    'smoke' {
      Assert-Docker
      Assert-EnvFile
      if (-not (Invoke-Smoke -FullLoop:$Full)) { throw 'smoke check failed' }
    }

    'backup' {
      Assert-Docker
      Assert-EnvFile
      & (Join-Path $RepoRoot 'scripts\home-backup.ps1') -BackupDir (Resolve-BackupDir (Get-DefaultBackupDir))
    }

    'restore' {
      Assert-Docker
      Assert-EnvFile
      & (Join-Path $RepoRoot 'scripts\home-restore.ps1') `
        -BackupDir (Resolve-BackupDir (Get-DefaultBackupDir)) `
        -Which $Which -Stamp $Timestamp
    }

    'tunnel-up' {
      Assert-Docker
      Assert-EnvFile
      $match = Select-String -Path $EnvFile -Pattern '^CLOUDFLARE_TUNNEL_TOKEN=(.*)$' |
        Select-Object -First 1
      $token = ''
      if ($match) { $token = $match.Matches[0].Groups[1].Value.Trim() }
      if (-not $token) {
        throw @"
CLOUDFLARE_TUNNEL_TOKEN is blank in .env.home

  Create the tunnel in Zero Trust first, point its public hostname at
  http://app:3000, then paste the connector token into .env.home. Nothing is
  published until you do -- the profile is off by default on purpose.
"@
      }
      Write-Step 'starting the tunnel (this is the step that publishes betamods.com)'
      Invoke-Compose (Get-ComposeArgs -Tunnel) @('up', '-d', 'cloudflared')
      Write-Note 'watch for "Registered tunnel connection": .\scripts\home-stack.ps1 logs -Service cloudflared'
    }

    'tunnel-down' {
      Assert-Docker
      Assert-EnvFile
      Write-Step 'stopping the tunnel only -- the app keeps serving locally'
      Invoke-Compose (Get-ComposeArgs -Tunnel) @('stop', 'cloudflared')
    }
  }
} catch {
  Write-Fail $_.Exception.Message
  exit 1
}
