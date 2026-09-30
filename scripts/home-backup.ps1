<#
.SYNOPSIS
  Back up the home stack: the R2 bucket inventory and the Neon production database.

.DESCRIPTION
  Two artefacts, because they cover different kinds of loss:

    r2-inventory-<stamp>.json  A RECORD of the bucket that holds every final mod
                              archive: key, size, and a cross-check against the
                              database. NOT a copy of the archives. The bucket
                              is deliberately not mirrored, because a second
                              copy of the same bytes would double storage cost
                              and push the pilot out of the free allowance.
                              What this buys you is the ability to tell, after
                              any incident, exactly which archives exist --
                              and to spot the two failures that are otherwise
                              invisible: objects no build row points at (wasted
                              spend) and build rows with no object (a download
                              that will 404).
    neon-<stamp>.dump         Neon `main` branch, custom-format pg_dump. Taken
                             with the DIRECT (non-pooled) Neon connection
                             string, never the pooled one the app uses, because
                             pg_dump streams through a transaction pooler in
                             ways that break it.

  What is deliberately NOT here: the app-data volume. Since R2 became final
  storage, that volume is quarantine scratch and is emptied as each upload
  finishes. It holds no user archives, so archiving it would protect nothing
  while preserving unscanned user uploads (including anything malware-flagged)
  in a second place. Use -IncludeQuarantine only when you specifically want a
  forensic copy of whatever was in flight when something went wrong.

  Every dump is verified after it is written. An unverified backup is not a
  backup.

  Backups are written locally. Database reads and R2 inventory requests still
  consume provider resources; this script does not enforce a billing limit.

.PARAMETER BackupDir
  Destination folder. Defaults to $env:BETAMODS_BACKUP_DIR, else
  C:\betamods-backups. Must be outside the repo and outside OneDrive.

.PARAMETER IncludeQuarantine
  Also archive the app-data volume. Off by default -- see .DESCRIPTION.

.PARAMETER NeonDirectUrl
  Neon DIRECT (non-pooled) connection string. Defaults to
  $env:NEON_DIRECT_URL, else NEON_DIRECT_URL read from a .backup.env file
  beside this repo. Never echoed to the console.

.PARAMETER SkipNeon
  Take only the R2 inventory, not the database dump.

.PARAMETER Keep
  Days of dumps/tarballs to keep (older ones are pruned). Default 14.
#>
[CmdletBinding()]
param(
  [string] $BackupDir,
  [string] $NeonDirectUrl,
  [string] $BackupEnvFile,
  [switch] $SkipNeon,
  [switch] $IncludeQuarantine,
  [ValidateRange(1, 365)]
  [int] $Keep = 14
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $BackupDir) {
  if ($env:BETAMODS_BACKUP_DIR) { $BackupDir = $env:BETAMODS_BACKUP_DIR }
  else { $BackupDir = 'C:\betamods-backups' }
}
if (-not $BackupEnvFile) { $BackupEnvFile = Join-Path $RepoRoot '.backup.env' }

# Compose project name from compose.home.yml -> the actual volume name.
$ProjectName = 'betamods-home'
$AppDataVolume = "${ProjectName}_app-data"
$Stamp = Get-Date -Format 'yyyy-MM-dd'

# The postgres image supplies pg_dump. Its major version MUST be greater than
# or equal to the Neon server's -- pg_dump aborts outright against a newer
# server ("server version: 180006; pg_dump version: 170005"). Neon here is on
# PostgreSQL 18, so this is deliberately :18, and the preflight below verifies
# the pairing instead of trusting it. Bump this if Neon upgrades.
$PostgresImage = 'postgres:18-alpine'

function Write-Step { param([string] $m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Note { param([string] $m) Write-Host "    $m" -ForegroundColor DarkGray }
function Write-Fail { param([string] $m) Write-Host "!!! $m" -ForegroundColor Red }

function Get-EnvValue {
  param([string] $File, [string] $Name)
  if (-not (Test-Path $File)) { return '' }
  $m = Select-String -Path $File -Pattern "^$Name=(.*)$" | Select-Object -First 1
  if (-not $m) { return '' }
  return $m.Matches[0].Groups[1].Value.Trim()
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'docker not found on PATH -- start Docker Desktop and re-run.'
}
& docker info --format '{{.ServerVersion}}' 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker engine is not responding.' }

$BackupDir = [System.IO.Path]::GetFullPath($BackupDir)
if ($BackupDir -match '(?i)\\OneDrive(\\|$)') {
  throw "BackupDir is inside OneDrive ($BackupDir). Use a plain local folder."
}
if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
  Write-Note "created $BackupDir"
}

# A bind mount out of a OneDrive-synced repo is slow and can fail on locking.
Write-Note "backup dir: $BackupDir"

$failures = @()

# --- 1. R2 inventory --------------------------------------------------------
# The bucket holds every final archive, and is deliberately not copied. This
# records what is in it and cross-checks it against the database, which is what
# makes a loss diagnosable. Requires node (already needed to build the images).
$inventoryName = "r2-inventory-$Stamp.json"
$inventoryPath = Join-Path $BackupDir $inventoryName
Write-Step "inventorying R2 bucket -> $inventoryName"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Fail 'node not found on PATH -- cannot run scripts/r2-inventory.mjs'
  $failures += "$inventoryName (no node)"
} else {
  & node (Join-Path $RepoRoot 'scripts/r2-inventory.mjs') --out $inventoryPath 2>&1 |
    ForEach-Object { Write-Note "  $_" }
  if ($LASTEXITCODE -ne 0) {
    Write-Fail 'R2 inventory failed -- the bucket could not be listed'
    $failures += $inventoryName
  } elseif (-not (Test-Path $inventoryPath)) {
    Write-Fail 'R2 inventory produced no file'
    $failures += "$inventoryName (missing)"
  } else {
    $size = (Get-Item $inventoryPath).Length
    if ($size -le 2) {
      Write-Fail 'R2 inventory is empty -- expected a JSON object'
      $failures += "$inventoryName (empty)"
    } else {
      # Parse it: a file that exists but is not valid JSON is not a record.
      try {
        $inv = Get-Content $inventoryPath -Raw | ConvertFrom-Json
        Write-Note ("ok: {0} ({1} object(s), {2} bytes in bucket)" -f $inventoryName, $inv.totals.objects, $inv.totals.bytes)
        if ($inv.drift -and $inv.drift.orphanedObjects.Count -gt 0) {
          # Not a backup failure, but it IS money being spent on nothing.
          Write-Fail ("{0} orphaned object(s) in the bucket with no build row -- deleting a mod may have left these behind" -f $inv.drift.orphanedObjects.Count)
        }
        if ($inv.drift -and $inv.drift.missingObjects.Count -gt 0) {
          Write-Fail ("{0} build row(s) point at a missing object -- those downloads will 404" -f $inv.drift.missingObjects.Count)
        }
      } catch {
        Write-Fail 'R2 inventory is not valid JSON'
        $failures += "$inventoryName (corrupt)"
      }
    }
  }
}

# --- 1b. quarantine volume (opt-in) ----------------------------------------
if ($IncludeQuarantine) {
  Write-Step "archiving volume $AppDataVolume (quarantine scratch)"
  $tgz = Join-Path $BackupDir "app-data-$Stamp.tgz"
  & docker run --rm `
    --mount "type=volume,source=$AppDataVolume,target=/data,readonly" `
    --mount "type=bind,source=$BackupDir,target=/backup" `
    alpine:3.20 sh -c "tar czf /backup/app-data-$Stamp.tgz -C /data ."
  if ($LASTEXITCODE -ne 0) {
    Write-Fail 'volume archive failed'
    $failures += "app-data-$Stamp.tgz"
  } else {
    $size = (Get-Item $tgz).Length
    if ($size -le 0) {
      Write-Fail 'volume archive is empty -- the volume is probably missing, not empty'
      $failures += "app-data-$Stamp.tgz (empty)"
    } else {
      # Prove the archive is readable, not merely present.
      & docker run --rm `
        --mount "type=bind,source=$BackupDir,target=/backup,readonly" `
        alpine:3.20 sh -c "tar tzf /backup/app-data-$Stamp.tgz > /dev/null"
      if ($LASTEXITCODE -ne 0) {
        Write-Fail 'volume archive is not readable'
        $failures += "app-data-$Steam.tgz (corrupt)"
      } else {
        Write-Note ("ok: app-data-$Stamp.tgz ({0:N1} MB)" -f ($size / 1MB))
      }
    }
  }
} else {
  Write-Note 'skipping the quarantine volume (no final archives live there; use -IncludeQuarantine for forensics)'
}

# --- 2. Neon ---------------------------------------------------------------
if (-not $SkipNeon) {
  $url = $NeonDirectUrl
  if (-not $url) { $url = $env:NEON_DIRECT_URL }
  if (-not $url) { $url = Get-EnvValue -File $BackupEnvFile -Name 'NEON_DIRECT_URL' }

  if (-not $url) {
    Write-Fail 'no Neon DIRECT connection string -- skipping the database dump.'
    Write-Fail "  set it with: \$env:NEON_DIRECT_URL='postgresql://...'  (pooled string will NOT work)"
    $failures += 'neon dump (no DIRECT url)'
  } elseif ($url -match '(?i)-pooler\.') {
    # Catching this is the whole point: a pooled URL produces a dump that
    # restores into an empty database, silently.
    Write-Fail 'NEON_DIRECT_URL looks like a POOLED (pgbouncer) URL.'
    Write-Fail '  pg_dump needs the direct endpoint -- take it from Neon console -> Connection Details -> Direct.'
    $failures += 'neon dump (pooled url rejected)'
  } else {
    Write-Step "dumping Neon main branch to neon-$Stamp.dump"

    # Fail fast if pg_dump would refuse the connection. Neon is on PostgreSQL 18
    # at the time of writing; an older postgres image would abort with a
    # confusing "server version" error deep inside pg_dump, and a backup script
    # that silently stopped producing dumps is the worst kind.
    $env:NEON_DIRECT_URL = $url
    try {
      $probe = 'echo "client=$(pg_dump --version | grep -oE ''[0-9]+'' | head -1)"; echo "server=$(psql -tAc ''show server_version'' "$NEON_DIRECT_URL" 2>/dev/null | head -1 | cut -d. -f1)"'
      $probeOut = & docker run --rm --env NEON_DIRECT_URL $PostgresImage sh -c $probe 2>&1
      $clientMajor = $null
      $serverMajor = $null
      foreach ($line in $probeOut) {
        if ("$line" -match '^client=(\d+)') { $clientMajor = [int]$Matches[1] }
        if ("$line" -match '^server=(\d+)') { $serverMajor = [int]$Matches[1] }
      }
      if ($clientMajor -and $serverMajor -and $clientMajor -lt $serverMajor) {
        throw ("pg_dump $clientMajor is older than the Neon server $serverMajor. " +
          "Set `$PostgresImage in this script to 'postgres:${serverMajor}-alpine' and re-run.")
      }
      Write-Note "pg_dump $clientMajor against server $serverMajor (image $PostgresImage)"

      $dumpName = "neon-$Stamp.dump"
      # The URL goes in through the environment, never on the command line, so it
      # does not land in this machine's command history. `sh -c` is what expands
      # $NEON_DIRECT_URL -- passing it as a bare argv entry would hand pg_dump
      # the literal text "$NEON_DIRECT_URL".
      $pgDumpCmd = 'pg_dump --no-owner --no-privileges --format=custom --file="/backup/{0}" "$NEON_DIRECT_URL"' -f $dumpName
      & docker run --rm `
        --env NEON_DIRECT_URL `
        --mount "type=bind,source=$BackupDir,target=/backup" `
        $PostgresImage sh -c $pgDumpCmd
      if ($LASTEXITCODE -ne 0) {
        Write-Fail 'pg_dump failed'
        $failures += $dumpName
      } else {
        $size = (Get-Item (Join-Path $BackupDir $dumpName)).Length
        if ($size -le 0) {
          Write-Fail 'pg_dump produced an empty file'
          $failures += "$dumpName (empty)"
        } else {
          # `pg_restore --list` parses the archive header; a truncated or
          # corrupt dump fails here rather than during an emergency restore.
          & docker run --rm `
            --mount "type=bind,source=$BackupDir,target=/backup,readonly" `
            $PostgresImage `
            sh -c "pg_restore --list /backup/$dumpName > /dev/null"
          if ($LASTEXITCODE -ne 0) {
            Write-Fail 'dump did not pass pg_restore --list (corrupt?)'
            $failures += "$dumpName (corrupt)"
          } else {
            Write-Note ("ok: {0} ({1:N1} MB)" -f $dumpName, ($size / 1MB))
          }
        }
      }
    } finally {
      Remove-Item Env:\NEON_DIRECT_URL -ErrorAction SilentlyContinue
    }
  }
}

# --- 3. prune --------------------------------------------------------------
Write-Step "pruning backups older than $Keep days"
Get-ChildItem -Path $BackupDir -Filter 'r2-inventory-*.json' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Keep) } |
  ForEach-Object { Write-Note "pruning $($_.Name)"; Remove-Item $_.FullName -Force }
Get-ChildItem -Path $BackupDir -Filter 'app-data-*.tgz' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Keep) } |
  ForEach-Object { Write-Note "pruning $($_.Name)"; Remove-Item $_.FullName -Force }
Get-ChildItem -Path $BackupDir -Filter 'neon-*.dump' -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$Keep) } |
  ForEach-Object { Write-Note "pruning $($_.Name)"; Remove-Item $_.FullName -Force }

# --- result ----------------------------------------------------------------
Write-Host ''
Write-Host '--- backup results ---' -ForegroundColor Cyan
Get-ChildItem -Path $BackupDir -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 10 |
  ForEach-Object {
    Write-Host ("  {0,-28} {1,10:N1} MB  {2}" -f $_.Name, ($_.Length / 1MB), $_.LastWriteTime)
  }

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Fail "incomplete backup: $($failures -join ', ')"
  exit 1
}
Write-Host ''
Write-Step 'backup complete and verified'
