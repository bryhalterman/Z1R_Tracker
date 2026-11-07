#!/usr/bin/env sh
# Serves the Z1R Tracker OBS pages on a local http origin. Requires Node.js:
# the pages are module scripts, which do not load from file://, and the docks
# and the overlay only sync when they share one http origin.
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install it from https://nodejs.org and run this again."
  exit 1
fi
exec node serve.mjs "$@"
