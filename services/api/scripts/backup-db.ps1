<#
.SYNOPSIS
  Exports a full backup of a YCT Alert PostgreSQL database before Render Free DB expiration.

.DESCRIPTION
  Uses Docker postgres:16-alpine pg_dump over SSL to create both a custom-format dump (.dump)
  and a plain SQL dump (.sql) in a local ./backups directory (gitignored via tmp/ or backups/).
  Refuses to connect to forbidden YCT Map databases (yct_postgres, yctmap, yct_map).

.EXAMPLE
  .\services\api\scripts\backup-db.ps1 -ExternalDatabaseUrl "postgresql://user:pass@dpg-xxxx.oregon-postgres.render.com/yct_alert?sslmode=require"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ExternalDatabaseUrl,

  [string]$OutputDir = "C:\Users\HP\Documents\YCT Alert\tmp\db_backups"
)

$ErrorActionPreference = "Stop"

$lower = $ExternalDatabaseUrl.ToLowerInvariant()
foreach ($forbidden in @("yct_postgres", "yctmap", "yct_map")) {
  if ($lower.Contains($forbidden)) {
    throw "SAFEGUARD ABORT: Database URL contains forbidden identifier '$forbidden'."
  }
}

if (-not $ExternalDatabaseUrl.Contains("sslmode=")) {
  if ($ExternalDatabaseUrl.Contains("?")) {
    $ExternalDatabaseUrl = "$ExternalDatabaseUrl&sslmode=require"
  } else {
    $ExternalDatabaseUrl = "$ExternalDatabaseUrl?sslmode=require"
  }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$customFile = "yct_alert_${timestamp}.dump"
$sqlFile = "yct_alert_${timestamp}.sql"

Write-Host "[backup] Creating custom-format pg_dump -> $OutputDir\$customFile"
docker run --rm -v "${OutputDir}:/backups" postgres:16-alpine `
  pg_dump --format=custom --no-owner --no-privileges --file="/backups/$customFile" "$ExternalDatabaseUrl"
if ($LASTEXITCODE -ne 0) { throw "pg_dump (custom) failed with exit code $LASTEXITCODE" }

Write-Host "[backup] Creating plain SQL pg_dump -> $OutputDir\$sqlFile"
docker run --rm -v "${OutputDir}:/backups" postgres:16-alpine `
  pg_dump --format=plain --no-owner --no-privileges --file="/backups/$sqlFile" "$ExternalDatabaseUrl"
if ($LASTEXITCODE -ne 0) { throw "pg_dump (plain) failed with exit code $LASTEXITCODE" }

Write-Host "[backup] Backup complete:"
Get-ChildItem $OutputDir -Filter "yct_alert_${timestamp}*" | Select-Object Name, Length, LastWriteTime
