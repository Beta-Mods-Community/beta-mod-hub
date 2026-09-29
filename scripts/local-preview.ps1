# Starts the existing native tools; no Docker, DNS, tunnel, or paid service.
[CmdletBinding()]
param([ValidateSet('start','stop','status')][string] $Command = 'start', [switch] $Open)
$ErrorActionPreference = 'Stop'
$PreviewRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PreviewStateDir = Join-Path $env:LOCALAPPDATA 'BetaMods\local-preview'
$PreviewStateFile = Join-Path $PreviewStateDir 'processes.json'
$ServiceScript = Join-Path $PSScriptRoot 'local-service.mjs'
New-Item -ItemType Directory -Path $PreviewStateDir -Force | Out-Null

function Test-PreviewHealth {
  try { return (Invoke-WebRequest 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 4).StatusCode -eq 200 }
  catch { return $false }
}
function Get-PreviewListener([int] $Port) {
  return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}
function Assert-LoopbackListeners {
  foreach ($port in @(3000,3311,3310)) {
    foreach ($listener in (Get-PreviewListener $port)) {
      if ($listener.LocalAddress -notin @('127.0.0.1','::1')) {
        throw "Port $port is listening beyond this PC. Configure that service to use 127.0.0.1 before starting the local preview. No process was stopped."
      }
    }
  }
}
function Read-PreviewState {
  if (Test-Path -LiteralPath $PreviewStateFile) { return @(Get-Content -LiteralPath $PreviewStateFile -Raw | ConvertFrom-Json) }
  return @()
}

if ($Command -eq 'status') {
  Assert-LoopbackListeners
  foreach ($port in @(3000,3311,3310)) { Write-Host ("Port {0}: {1}" -f $port, (@(Get-PreviewListener $port).Count -gt 0)) }
  if (Test-PreviewHealth) { Write-Host 'Ready: http://127.0.0.1:3000'; exit 0 }
  Write-Host 'Preview is not healthy. Run local-preview.ps1 start; logs are in LocalAppData\BetaMods\local-preview.'
  exit 1
}

if ($Command -eq 'stop') {
  foreach ($entry in (Read-PreviewState)) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.pid)" -ErrorAction SilentlyContinue
    if (!$process) { continue }
    # PID reuse must never cause an unrelated process to be terminated.
    $sameProcess = $process.CreationDate.ToUniversalTime().ToString('o') -eq $entry.created
    $knownCommand = $process.CommandLine -and ($process.CommandLine.Contains($ServiceScript) -or ($entry.service -eq 'clamd' -and $process.CommandLine.Contains($entry.executable)))
    if ($sameProcess -and $knownCommand) {
      & taskkill.exe /PID $entry.pid /T /F | Out-Null
      Write-Host "Stopped managed $($entry.service)."
    } else { Write-Warning "Skipped PID $($entry.pid): it is not the saved preview process." }
  }
  '[]' | Set-Content -LiteralPath $PreviewStateFile -Encoding UTF8
  exit 0
}

Assert-LoopbackListeners
if (Test-PreviewHealth) {
  Write-Host 'Already ready: http://127.0.0.1:3000'
  if ($Open) { Start-Process 'http://127.0.0.1:3000' }
  exit 0
}
foreach ($port in @(3000,3311)) {
  if (@(Get-PreviewListener $port).Count -gt 0) { throw "Port $port is already in use. Stop the prior preview first; no unrelated process was stopped." }
}
$NodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$SavedProcesses = @(Read-PreviewState)
function Save-StartedProcess($Process, [string] $Name, [string] $Executable) {
  $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($Process.Id)"
  if (!$details) { throw "$Name exited early. Check $PreviewStateDir logs." }
  $script:SavedProcesses += [pscustomobject]@{ pid=$Process.Id; service=$Name; executable=$Executable; created=$details.CreationDate.ToUniversalTime().ToString('o') }
  ConvertTo-Json -InputObject @($script:SavedProcesses) | Set-Content -LiteralPath $PreviewStateFile -Encoding UTF8
}

if (@(Get-PreviewListener 3310).Count -eq 0) {
  $ClamRoot = Join-Path $env:USERPROFILE 'ClamAV'
  $ClamConfig = Join-Path $ClamRoot 'clamd.conf'
  $ClamExecutable = Get-ChildItem -LiteralPath $ClamRoot -Filter clamd.exe -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
  if (!$ClamExecutable -or !(Test-Path -LiteralPath $ClamConfig)) { throw 'ClamAV is missing. The preview will not start without malware scanning.' }
  $ClamConfigText = Get-Content -LiteralPath $ClamConfig -Raw
  $ClamBindAddresses = @([regex]::Matches($ClamConfigText, '(?m)^\s*TCPAddr\s+(\S+)') | ForEach-Object { $_.Groups[1].Value })
  if (!$ClamBindAddresses.Count -or @($ClamBindAddresses | Where-Object { $_ -notin @('127.0.0.1','::1') }).Count) {
    throw 'ClamAV must explicitly bind TCPAddr to 127.0.0.1 or ::1 for local preview. Update its private clamd.conf before starting.'
  }
  $clam = Start-Process -FilePath $ClamExecutable -ArgumentList @('--config-file', ('"{0}"' -f $ClamConfig)) -WorkingDirectory $PreviewRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PreviewStateDir 'clamd.log') -RedirectStandardError (Join-Path $PreviewStateDir 'clamd.error.log')
  Save-StartedProcess $clam 'clamd' $ClamExecutable
}
foreach ($service in @('scanner','app')) {
  $process = Start-Process -FilePath $NodeExecutable -ArgumentList @(('"{0}"' -f $ServiceScript),$service) -WorkingDirectory $PreviewRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PreviewStateDir "$service.log") -RedirectStandardError (Join-Path $PreviewStateDir "$service.error.log")
  Save-StartedProcess $process $service $NodeExecutable
}
Write-Host 'Starting Beta Mods and checking the database and malware scanner...'
for ($attempt=0; $attempt -lt 30; $attempt++) {
  if (Test-PreviewHealth) {
    Assert-LoopbackListeners
    Write-Host 'Ready: http://127.0.0.1:3000 (local development only)'
    if ($Open) { Start-Process 'http://127.0.0.1:3000' }
    exit 0
  }
  Start-Sleep -Seconds 2
}
throw "Preview did not become healthy. Logs: $PreviewStateDir. Use the stop command before retrying."
