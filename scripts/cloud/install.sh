#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
version="$(node --version)"
if [[ "$version" != "v22.23.0" ]]; then
  printf 'AXIOM requires the verified Node v22.23.0 runtime; found %s. Select it before installing.\n' "$version" >&2
  exit 1
fi
# Run only where access to the pinned npm packages is already authorized.
npm ci
