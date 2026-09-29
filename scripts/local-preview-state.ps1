# State helpers are separate so Windows PowerShell 5.1 serialization and stop
# identity checks can be tested without starting or stopping any real service.
function ConvertTo-PreviewProcessRecords {
  param($Value, [int] $Depth = 0)
  if ($null -eq $Value) { return }
  if ($Depth -gt 12) { throw 'Preview process state is nested too deeply. No process was stopped.' }

  foreach ($entry in $Value) {
    if ($null -eq $entry) { continue }
    # PS 5.1 can serialize a ConvertFrom-Json array wrapper as {value, Count}.
    # Recover older records rather than losing ownership of their services.
    $properties = @($entry.PSObject.Properties.Name)
    if ('pid' -notin $properties -and 'value' -in $properties -and 'Count' -in $properties) {
      ConvertTo-PreviewProcessRecords -Value $entry.value -Depth ($Depth + 1)
      continue
    }

    $processId = 0
    $created = [datetime]::MinValue
    # PowerShell 7.5+ decodes ISO JSON dates as DateTime; 5.1 keeps strings.
    $createdText = if ($entry.created -is [datetime]) { $entry.created.ToString('o') } else { [string]$entry.created }
    if (![int]::TryParse([string]$entry.pid, [ref]$processId) -or $processId -le 0 -or
        $entry.service -notin @('app', 'scanner', 'clamd') -or
        [string]::IsNullOrWhiteSpace([string]$entry.executable) -or
        ![System.IO.Path]::IsPathRooted([string]$entry.executable) -or
        ![datetime]::TryParseExact($createdText, 'o', [Globalization.CultureInfo]::InvariantCulture,
          [Globalization.DateTimeStyles]::RoundtripKind, [ref]$created) -or
        $created.Kind -ne [DateTimeKind]::Utc) {
      Write-Warning 'Ignored an invalid preview process-state entry; it cannot authorize stopping a process.'
      continue
    }

    # Emit individual plain records, never the PS 5.1 JSON array wrapper.
    [pscustomobject]@{
      pid = $processId
      service = [string]$entry.service
      executable = [string]$entry.executable
      created = $created.ToString('o')
    }
  }
}

function Read-PreviewState([string] $Path) {
  if (!(Test-Path -LiteralPath $Path)) { return }
  $decoded = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  ConvertTo-PreviewProcessRecords -Value $decoded
}

function Write-PreviewState([string] $Path, [object[]] $Records) {
  $flatRecords = @(ConvertTo-PreviewProcessRecords -Value $Records)
  ConvertTo-Json -InputObject $flatRecords -Depth 4 -Compress | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Test-PreviewProcessIdentity($Process, $Entry, [string] $ServiceScript) {
  $validEntries = @(ConvertTo-PreviewProcessRecords -Value $Entry)
  if ($validEntries.Count -ne 1 -or !$Process -or !$Process.CreationDate -or !$Process.CommandLine) { return $false }
  $saved = $validEntries[0]
  if ($Process.ProcessId -ne $saved.pid -or
      $Process.CreationDate.ToUniversalTime().ToString('o') -ne $saved.created) { return $false }

  # A matching PID alone is never enough, even after reading a legacy record.
  if ($Process.ExecutablePath -and
      ![string]::Equals($Process.ExecutablePath, $saved.executable, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ($saved.service -eq 'clamd') {
    return $Process.CommandLine.IndexOf($saved.executable, [StringComparison]::OrdinalIgnoreCase) -ge 0
  }
  return $Process.CommandLine.IndexOf($ServiceScript, [StringComparison]::OrdinalIgnoreCase) -ge 0
}
