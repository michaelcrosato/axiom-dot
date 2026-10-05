#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
version="$(node --version)"
if [[ "$version" != "v22.23.0" ]]; then
  printf 'AXIOM requires the verified Node v22.23.0 runtime; found %s.\n' "$version" >&2
  exit 1
fi
# A remote workspace must provide its own authorized private port forwarding.
exec node node_modules/vite/bin/vite.js --config vite.client.config.ts --host 127.0.0.1
