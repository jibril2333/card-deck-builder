#!/bin/bash
#
# Boot/login auto-start for the Card Deck Builder PRODUCTION server (port 3001).
# Invoked by the LaunchAgent `com.rei.card-deck-builder` so the app (and thus
# the Cloudflare tunnel that forwards to :3001) survives reboots without a
# manual start.
#
# It reuses the existing clean prod build in .next.nosync/prod and only builds
# when there isn't one — a rebuild on every login would be slow and can OOM.
# Code changes still get a manual `rm -rf .next.nosync/prod && npm run build`
# (see AGENTS.md); this script just brings the current build back up.

set -u
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd /Users/rei/card-deck-builder || exit 1

# If iCloud evicted node deps to dataless stubs, the server can't start — try a
# best-effort materialize before giving up (see AGENTS.md on iCloud hostility).
if [ ! -x node_modules/.bin/next ]; then
  echo "[$(date)] next binary missing; attempting brctl download of node_modules" >&2
  /usr/bin/brctl download node_modules 2>/dev/null || true
fi

# Ensure a production build exists; build once if it doesn't.
if [ ! -f .next.nosync/prod/BUILD_ID ]; then
  echo "[$(date)] no prod build found — building" >&2
  npm run build || { echo "[$(date)] build failed" >&2; exit 1; }
fi

echo "[$(date)] starting prod server on :3001" >&2
exec npm start -- -p 3001
