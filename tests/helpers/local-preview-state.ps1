$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\scripts\local-preview-state.ps1')

function Assert-Check([bool] $Condition, [string] $Message) {
  if (!$Condition) { throw $Message }
}

$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('betamods-preview-state-' + [guid]::NewGuid().ToString('N'))
$testStateFile = Join-Path $testDirectory 'processes.json'
New-Item -ItemType Directory -Path $testDirectory | Out-Null
try {
  $created = '2026-09-29T21:54:06.0103910Z'
  $serviceScript = 'C:\test-preview\scripts\local-service.mjs'
  $record = [pscustomobject]@{ pid=1234; service='app'; executable='C:\node\node.exe'; created=$created }

  Assert-Check (@(Read-PreviewState -Path $testStateFile).Count -eq 0) 'Missing state must be empty.'
  Write-PreviewState -Path $testStateFile -Records @()
  Assert-Check ((Get-Content -LiteralPath $testStateFile -Raw).Trim() -eq '[]') 'Empty state must serialize as [], not a PS wrapper.'
  Assert-Check (@(Read-PreviewState -Path $testStateFile).Count -eq 0) 'Empty state must remain empty after reading.'

  Write-PreviewState -Path $testStateFile -Records @($record)
  for ($roundtrip = 0; $roundtrip -lt 3; $roundtrip++) {
    $records = @(Read-PreviewState -Path $testStateFile)
    Assert-Check ($records.Count -eq 1 -and $records[0].pid -eq 1234) 'Repeated reads must preserve one flat record.'
    Write-PreviewState -Path $testStateFile -Records $records
    Assert-Check ((Get-Content -LiteralPath $testStateFile -Raw) -notmatch '"(value|Count)"') 'Roundtrips must not create value/Count wrappers.'
  }

  $legacyState = '[{"value":[{"value":"","Count":0},{"pid":1234,"service":"app","executable":"C:\\node\\node.exe","created":"2026-09-29T21:54:06.0103910Z"}],"Count":2},{"pid":1235,"service":"scanner","executable":"C:\\node\\node.exe","created":"2026-09-29T21:54:06.0103910Z"}]'
  Set-Content -LiteralPath $testStateFile -Value $legacyState -Encoding UTF8
  $records = @(Read-PreviewState -Path $testStateFile -WarningAction SilentlyContinue)
  Assert-Check ($records.Count -eq 2 -and $records[0].pid -eq 1234 -and $records[1].pid -eq 1235) 'Recover both nested legacy and new records.'
  Write-PreviewState -Path $testStateFile -Records $records
  Assert-Check ((Get-Content -LiteralPath $testStateFile -Raw) -notmatch '"(value|Count)"') 'Legacy records must be rewritten flat.'

  $invalid = @($null, [pscustomobject]@{pid='1 OR 1=1'}, [pscustomobject]@{pid=0}, [pscustomobject]@{pid=-1},
    [pscustomobject]@{pid=1234;service='app';executable='relative.exe';created=$created},
    [pscustomobject]@{pid=1234;service='other';executable='C:\node\node.exe';created=$created},
    [pscustomobject]@{pid=1234;service='app';executable='C:\node\node.exe';created='not a date'})
  Assert-Check (@(ConvertTo-PreviewProcessRecords -Value $invalid -WarningAction SilentlyContinue).Count -eq 0) 'Malformed entries must never reach process lookup.'

  $fakeProcess = [pscustomobject]@{
    ProcessId=1234
    CreationDate=[datetime]::Parse($created, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
    ExecutablePath='C:\node\node.exe'
    CommandLine=('"C:\node\node.exe" "{0}" app' -f $serviceScript)
  }
  Assert-Check (Test-PreviewProcessIdentity $fakeProcess $record $serviceScript) 'Exact saved process identity must be accepted.'
  $fakeProcess.CreationDate = $fakeProcess.CreationDate.AddSeconds(1)
  Assert-Check (!(Test-PreviewProcessIdentity $fakeProcess $record $serviceScript)) 'A reused PID must never authorize termination.'
  $fakeProcess.CreationDate = $fakeProcess.CreationDate.AddSeconds(-1)
  $fakeProcess.ExecutablePath = 'C:\other\node.exe'
  Assert-Check (!(Test-PreviewProcessIdentity $fakeProcess $record $serviceScript)) 'Wrong executable must be rejected.'
  $fakeProcess.ExecutablePath = 'C:\node\node.exe'
  $fakeProcess.CommandLine = 'node unrelated-app.mjs'
  Assert-Check (!(Test-PreviewProcessIdentity $fakeProcess $record $serviceScript)) 'Unrelated command line must be rejected.'
  Assert-Check (!(Test-PreviewProcessIdentity $null $record $serviceScript)) 'Missing process must be rejected.'

  # Run the real stop branch's statements with fake CIM/taskkill functions and
  # the temporary state path. Omit only exit, so this harness can assert results.
  $launcherPath = Join-Path $PSScriptRoot '..\..\scripts\local-preview.ps1'
  $parseErrors = $null
  $tokens = $null
  $launcherAst = [Management.Automation.Language.Parser]::ParseFile($launcherPath, [ref]$tokens, [ref]$parseErrors)
  Assert-Check (!$parseErrors.Count) 'Launcher must parse cleanly.'
  $stopIf = $launcherAst.Find({param($node)
    $node -is [Management.Automation.Language.IfStatementAst] -and
    $node.Clauses[0].Item1.Extent.Text -eq '$Command -eq ''stop'''
  }, $true)
  Assert-Check ($null -ne $stopIf) 'The launcher stop branch must be present.'
  $stopStatements = @($stopIf.Clauses[0].Item2.Statements | Where-Object { $_ -isnot [Management.Automation.Language.ExitStatementAst] })
  $PreviewStateFile = $testStateFile
  $script:mockQueries = @()
  $script:mockKills = @()
  $script:mockKillExitCode = 0
  $script:mockProcesses = @{}
  function Get-CimInstance {
    [CmdletBinding()]
    param([string] $ClassName, [string] $Filter)
    $script:mockQueries += $Filter
    return $script:mockProcesses[$Filter]
  }
  function taskkill.exe {
    $script:mockKills += [int]$args[1]
    $script:LASTEXITCODE = $script:mockKillExitCode
  }
  $fakeProcess.CommandLine = ('"C:\node\node.exe" "{0}" app' -f $serviceScript)
  $script:mockProcesses['ProcessId = 1234'] = $fakeProcess
  $reusedRecord = [pscustomobject]@{pid=1235;service='scanner';executable='C:\node\node.exe';created=$created}
  $script:mockProcesses['ProcessId = 1235'] = [pscustomobject]@{
    ProcessId=1235; CreationDate=$fakeProcess.CreationDate.AddSeconds(1)
    ExecutablePath='C:\node\node.exe'; CommandLine=$fakeProcess.CommandLine
  }
  Write-PreviewState -Path $testStateFile -Records @($record, $reusedRecord)
  foreach ($statement in $stopStatements) { . ([scriptblock]::Create($statement.Extent.Text)) }
  Assert-Check ($script:mockKills.Count -eq 1 -and $script:mockKills[0] -eq 1234) 'Real stop branch must stop only the matching saved process, never a reused PID.'
  Assert-Check (@(Read-PreviewState -Path $testStateFile).Count -eq 0) 'Successful stop must clear state.'

  Set-Content -LiteralPath $testStateFile -Value '[{"pid":null},{"pid":"1 OR 1=1"}]' -Encoding UTF8
  $script:mockQueries = @()
  $script:mockKills = @()
  foreach ($statement in $stopStatements) { . ([scriptblock]::Create($statement.Extent.Text)) }
  Assert-Check ($script:mockQueries.Count -eq 0 -and $script:mockKills.Count -eq 0) 'Invalid state must not issue CIM queries or kill commands.'

  Write-PreviewState -Path $testStateFile -Records @($record)
  $script:mockKillExitCode = 1
  $rejectedFailedStop = $false
  try { foreach ($statement in $stopStatements) { . ([scriptblock]::Create($statement.Extent.Text)) } }
  catch { $rejectedFailedStop = $true }
  Assert-Check $rejectedFailedStop 'Failed process termination must report failure.'
  Assert-Check (@(Read-PreviewState -Path $testStateFile).Count -eq 1) 'Failed stop must retain ownership records for retry.'

  Set-Content -LiteralPath $testStateFile -Value '{not-json' -Encoding UTF8
  $rejectedCorruptState = $false
  try { Read-PreviewState -Path $testStateFile | Out-Null } catch { $rejectedCorruptState = $true }
  Assert-Check $rejectedCorruptState 'Corrupt JSON must fail closed rather than overwrite ownership state.'
  Write-Output ('Preview-state checks passed on PowerShell ' + $PSVersionTable.PSVersion.ToString())
} finally {
  # Only this test-created file and its now-empty directory; never live state.
  if (Test-Path -LiteralPath $testStateFile) { Remove-Item -LiteralPath $testStateFile -Force }
  Remove-Item -LiteralPath $testDirectory
}
