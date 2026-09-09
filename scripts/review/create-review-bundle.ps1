#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
$Cli = Join-Path $Root "dist/cli.js"
if (-not (Test-Path $Cli)) {
  Push-Location $Root
  npm run build
  Pop-Location
}
& node $Cli review @args
exit $LASTEXITCODE
