<#
.SYNOPSIS
  Prepare this Windows PC to run the betamods production stack unattended.

.DESCRIPTION
  The home stack only survives reboots if the PC comes back up on its own and
  never suspends. This script configures both, plus an optional daily backup.

  It is deliberately opt-in per concern: pick the switches you want, or start
  with -Status to see the current state. SupportsShouldProcess is on, so -WhatIf
  shows every change without applying it.

  IMPORTANT: Docker Desktop is a desktop app, not a Windows service, so it
  cannot start before you sign in. This means the machine must be signed IN
  (a locked screen is fine) for the site to be reachable. If this PC reboots to
  a login prompt with no auto-login, nothing comes up until someone logs in --
  that is a property of Windows, not of this configuration.

.PARAMETER Status
  Report the current state and change nothing.

.PARAMETER AutoStart
  Make Docker Desktop start at sign-in, and add a logon task that brings the
  stack up (containers alone would also return, since compose uses
  `restart: unless-stopped`, but this also covers a previous `down`).

.PARAMETER PreventSleep
  Stop the PC from sleeping or hibernating on AC power, and (on a laptop) stop
  closing the lid from suspending. Required for the site to stay reachable.

.PARAMETER DailyBackup
  Add a daily 04:00 task that runs scripts\home-stack.ps1 backup. It is allowed
  to run on battery and to catch up after a missed start, because a backup that
  silently does not run is not a backup.

.PARAMETER Remove
  Remove the tasks and restore Docker Desktop's sign-in behaviour this script
  added (leaves other settings alone).

.EXAMPLE
  .\deploy\home\windows\Prepare-Host.ps1 -Status

.EXAMPLE
  .\deploy\home\windows\Prepare-Host.ps1 -AutoStart -PreventSleep -DailyBackup
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
  [switch] $Status,
  [switch] $AutoStart,
  [switch] $PreventSleep,
  [switch] $DailyBackup,
  [switch] $Remove
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$StackScript = Join-Path $RepoRoot 'scripts\home-stack.ps1'

$StackTaskName = 'betamods-home-stack'
$BackupTaskName = 'betamods-home-backup'
$DockerRunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$DockerRunValue = 'Docker Desktop'
$DockerExe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'

function Write-Step { param([string] $m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Note { param([string] $m) Write-Host "    $m" -ForegroundColor DarkGray }
function Write-Warn { param([string] $m) Write-Host "!!! $m" -ForegroundColor Yellow }
function Write-Fail { param([string] $m) Write-Host "!!! $m" -ForegroundColor Red }
function Write-Ok { param([string] $m) Write-Host "    [ok] $m" -ForegroundColor Green }

function Get-Task {
  param([string] $Name)
  Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
}

function Remove-TaskIfPresent {
  param([string] $Name)
  if (Get-Task $Name) {
    if ($PSCmdlet.ShouldProcess("scheduled task '$Name'", 'Remove')) {
      Unregister-ScheduledTask -TaskName $Name -Confirm:$false
      Write-Ok "removed task '$Name'"
    }
  }
}

function New-InteractiveTask {
  <#
    .SYNOPSIS
      Register a task that runs only while this user is signed in, with no
      stored password.
    .DESCRIPTION
      'Interactive' is required: Docker Desktop is a GUI app, so the task has
      to run inside the signed-in session to reach the Docker engine.
      StartWhenAvailable + no battery restrictions are set so a missed or
      battery-time run still happens.
  #>
  param(
    [string] $Name,
    [string] $Description,
    [string] $Arguments,
    $Trigger
  )
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $Arguments
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
  Register-ScheduledTask -TaskName $Name -Description $Description `
    -Action $action -Trigger $Trigger -Settings $settings -Principal $principal -Force | Out-Null
}

function Test-DockerInstalled {
  if (Test-Path $DockerExe) { return $true }
  if (Get-Command docker -ErrorAction SilentlyContinue) { return $true }
  return $false
}

function Show-Status {
  Write-Step 'Docker Desktop'
  if (Test-DockerInstalled) {
    Write-Ok 'installed'
    Write-Note "exe: $DockerExe"
  } else {
    Write-Warn 'NOT installed -- install Docker Desktop with the WSL2 backend first'
  }
  $auto = $null
  if (Test-Path $DockerRunKey) {
    $auto = (Get-ItemProperty -Path $DockerRunKey -Name $DockerRunValue -ErrorAction SilentlyContinue).$DockerRunValue
  }
  if ($auto) { Write-Ok "starts at sign-in ($auto)" } else { Write-Warn 'does NOT start at sign-in' }

  Write-Step 'scheduled tasks'
  foreach ($n in @($StackTaskName, $BackupTaskName)) {
    $t = Get-Task $n
    if ($t) { Write-Ok "'$n' -> $($t.State)" } else { Write-Note "'$n' not present" }
  }

  Write-Step 'power (AC sleep settings)'
  $out = & powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>&1
  if ($LASTEXITCODE -eq 0) {
    ($out | Select-String -Pattern 'Current AC Power Setting Index') |
      ForEach-Object { Write-Note ($_ -replace '\s+', ' ') }
  } else {
    Write-Note 'could not query power settings'
  }
  # powercfg does not always expose a readable value here (it printed only the
  # scheme GUID on this laptop), so show whatever it gave us rather than
  # assuming a "Current AC Power Setting Index" line is there.
  $lid = @(& powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION 2>&1) |
    Where-Object { $_ -and $_ -notmatch '^\s*Power Scheme GUID' }
  if ($lid) {
    $lid | ForEach-Object { Write-Note ("lid action: " + (($_ -replace '\s+', ' ').Trim())) }
    Write-Note 'lid action 0 = do nothing, 3 = sleep'
  } else {
    Write-Note 'lid action not reported by powercfg on this machine'
  }

  Write-Step 'engine'
  # Guard the call: `& docker` on a machine without Docker throws
  # CommandNotFoundException, which $ErrorActionPreference='Stop' would turn
  # into a terminating error right here.
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Note 'docker not on PATH'
  } else {
    & docker info --format 'server {{.ServerVersion}}' 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Ok 'Docker engine responding' }
    else { Write-Note 'engine installed but not responding (start Docker Desktop)' }
  }
}

# --- actions ----------------------------------------------------------------

if ($Status) {
  Show-Status
  return
}

if ($Remove) {
  Remove-TaskIfPresent $StackTaskName
  Remove-TaskIfPresent $BackupTaskName
  if (Test-Path $DockerRunKey) {
    $existing = (Get-ItemProperty -Path $DockerRunKey -Name $DockerRunValue -ErrorAction SilentlyContinue).$DockerRunValue
    if ($existing -and $PSCmdlet.ShouldProcess('Docker Desktop sign-in entry', 'Remove')) {
      Remove-ItemProperty -Path $DockerRunKey -Name $DockerRunValue
      Write-Ok 'removed Docker Desktop sign-in entry'
    }
  }
  Write-Note 'power settings were left alone -- undo those in Settings > Power if you want to'
  return
}

if (-not (Test-Path $StackScript)) { throw "not found: $StackScript" }

if ($AutoStart) {
  Write-Step 'auto-start'
  if (-not (Test-DockerInstalled)) {
    throw 'Docker Desktop is not installed. Install it (WSL2 backend) and re-run.'
  }
  if (-not (Test-Path $DockerExe)) {
    Write-Warn "not at the expected path ($DockerExe); using whatever is on PATH"
  }

  # Same effect as Docker Desktop's "Start Docker Desktop when you sign in".
  if ($PSCmdlet.ShouldProcess('Docker Desktop sign-in entry', 'Set')) {
    if (-not (Test-Path $DockerRunKey)) { New-Item -Path $DockerRunKey -Force | Out-Null }
    New-ItemProperty -Path $DockerRunKey -Name $DockerRunValue `
      -Value "`"$DockerExe`"" -PropertyType String -Force | Out-Null
    Write-Ok 'Docker Desktop will start at sign-in'
  }

  # Containers return on their own via `restart: unless-stopped`; this task also
  # covers a stack that was previously taken down with `down`.
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $trigger.Delay = 'PT2M'   # give Docker Desktop time to finish starting
  if ($PSCmdlet.ShouldProcess("scheduled task '$StackTaskName'", 'Create or update')) {
    New-InteractiveTask -Name $StackTaskName `
      -Description 'Bring the betamods home stack up after sign-in.' `
      -Arguments "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"Set-Location '$RepoRoot'; & '$StackScript' up *>`"" `
      -Trigger $trigger
    Write-Ok "task '$StackTaskName' runs the stack up 2 minutes after sign-in"
  }
  Write-Note 'the PC must be signed in after a reboot; locking the screen is fine'
}

if ($PreventSleep) {
  Write-Step 'power policy (AC)'
  # Never sleep or hibernate on mains power, otherwise the site is offline
  # whenever the PC is idle and the tunnel drops with it.
  foreach ($pair in @(
      @{ Timeout = 'standby-timeout-ac'; Setting = 'sleep' },
      @{ Timeout = 'hibernate-timeout-ac'; Setting = 'hibernate' }
    )) {
    $label = if ($pair.Setting -eq 'sleep') { 'never sleep' } else { 'never hibernate' }
    if ($PSCmdlet.ShouldProcess("power setting '$($pair.Timeout)'", 'Set to 0 (never)')) {
      & powercfg /change $pair.Timeout 0
      if ($LASTEXITCODE -ne 0) { Write-Warn "could not set $($pair.Timeout)" }
      else { Write-Ok $label }
    }
  }

  # Lid close: on a desktop there is no lid, but setting the value is harmless
  # there, so this is applied unconditionally rather than probing for a
  # battery. (Probing with Get-CimInstance would also make `-WhatIf` print a
  # wall of "Set Alias" noise on first use of the CimCmdlets module.)
  if ($PSCmdlet.ShouldProcess('lid close action on AC', 'Set to do nothing')) {
    & powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
    # Required for setacvalueindex to take effect.
    & powercfg /setactive SCHEME_CURRENT
    if ($LASTEXITCODE -ne 0) { Write-Warn 'could not set the lid action' }
    else { Write-Ok 'closing the lid no longer suspends (on AC; no-op without a lid)' }
  }

  Write-Note 'battery settings were left unchanged, so an unplugged laptop may still sleep'
  Write-Note 'confirm with: powercfg /requests'
}

if ($DailyBackup) {
  Write-Step 'daily backup task'
  $trigger = New-ScheduledTaskTrigger -Daily -At '04:00'
  if ($PSCmdlet.ShouldProcess("scheduled task '$BackupTaskName'", 'Create or update')) {
    New-InteractiveTask -Name $BackupTaskName `
      -Description 'Back up the app-data volume and Neon database for betamods.' `
      -Arguments "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"Set-Location '$RepoRoot'; & '$StackScript' backup *>`"" `
      -Trigger $trigger
    Write-Ok "task '$BackupTaskName' runs `scripts\home-stack.ps1 backup` daily at 04:00"
  }
  Write-Note 'the first run needs a Neon DIRECT url: see DEPLOY-HOME.md "Backups"'
}

Write-Host ''
Write-Step 'done -- re-run with -Status to confirm'
