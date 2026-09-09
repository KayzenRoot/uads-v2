#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "../..")
& node (Join-Path $Root "scripts/install/install.mjs") @args
exit $LASTEXITCODE
