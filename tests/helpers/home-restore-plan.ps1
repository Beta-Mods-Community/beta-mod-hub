param([string] $BackupDir)
$ErrorActionPreference = 'Stop'

# The dry-run must stop before any external command or provider access.
function docker { throw 'Docker must not run during this offline restore-plan check.' }
function node { throw 'Node must not run during this offline restore-plan check.' }

& (Join-Path $PSScriptRoot '../../scripts/home-restore.ps1') -BackupDir $BackupDir -Which all
exit $LASTEXITCODE
