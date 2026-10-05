#!/bin/bash
# Put the verified Node runtime (.nvmrc) first on PATH for Claude Code cloud sessions.
# The agent shell does not read ~/.bashrc, so the environment's `nvm use` there is not enough.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
version="v$(tr -d '[:space:]' < .nvmrc)"
node_bin="${NVM_DIR:-/opt/nvm}/versions/node/$version/bin"

if [ ! -x "$node_bin/node" ]; then
  printf 'AXIOM: Node %s is not installed at %s; install it in the environment setup script.\n' "$version" "$node_bin" >&2
  exit 1
fi

echo "export PATH=\"$node_bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
export PATH="$node_bin:$PATH"

# Dependencies normally come from the environment setup; install only if missing.
if [ ! -d node_modules ]; then
  npm ci
fi
