#!/bin/bash
# =============================================================================
# Double-click this file to run Smart Study AI on your own Mac.
#
# It exists because node is installed through nvm, which isn't always loaded
# in a fresh Terminal — that's the "command not found: node" error. This finds
# node wherever it lives instead of relying on the PATH being set up.
# =============================================================================

cd "$(dirname "$0")" || exit 1

echo "Starting Smart Study AI..."
echo

# --- Find node ---------------------------------------------------------------
NODE=""
if command -v node >/dev/null 2>&1; then
  NODE="$(command -v node)"
else
  # Newest nvm-installed version, if nvm isn't initialised in this shell
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    [ -x "$candidate" ] && NODE="$candidate"
  done
fi

if [ -z "$NODE" ]; then
  echo "Could not find Node.js on this Mac."
  echo "Install it from https://nodejs.org and run this again."
  echo
  read -r -p "Press Return to close."
  exit 1
fi

echo "Using node $("$NODE" -v)"

# --- Find the API key --------------------------------------------------------
if [ -z "$ANTHROPIC_API_KEY" ] && [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo
  echo "No API key found, so quiz generation will not work."
  echo "Everything else will still run."
else
  echo "API key loaded."
fi

echo
echo "-------------------------------------------------------------"
echo "  Open this in your browser:   http://localhost:8765"
echo "  Press Control-C here to stop the server."
echo "-------------------------------------------------------------"
echo

"$NODE" dev-server.mjs
