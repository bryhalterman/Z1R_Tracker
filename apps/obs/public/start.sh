#!/usr/bin/env sh
# Runs Z1R Tracker on a local http origin so offline caching and OBS dock sync
# both work. Requires Node.js. Without Node, open index.html directly -- the
# tracker still works, minus offline caching.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Open index.html directly instead."
  exit 1
fi
exec node serve.mjs "$@"
