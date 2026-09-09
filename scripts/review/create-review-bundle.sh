#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$ROOT/dist/cli.js"

if [[ ! -f "$CLI" ]]; then
  (cd "$ROOT" && npm run build)
fi

exec node "$CLI" review "$@"
