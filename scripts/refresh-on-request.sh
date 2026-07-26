#!/bin/bash
#
# Bridge between the in-app "update now" button and refresh-cards.sh.
#
# The app runs INSIDE the container and must never be able to drive Docker —
# it's exposed to the internet through a Cloudflare tunnel, so handing it the
# docker socket would turn any app-level RCE into full host compromise. Instead
# the button just drops a request file into the shared data volume, and this
# script (run by a launchd WatchPaths agent on the HOST) picks it up and runs
# the refresh with host privileges.
#
# The request file's contents are treated as untrusted input: only names that
# exactly match a known stage are passed through, never interpolated into a
# command line.

set -uo pipefail

PROJECT_DIR="${CDB_PROJECT_DIR:-$HOME/card-deck-builder}"
DATA_DIR="$PROJECT_DIR/data.nosync"
REQUEST_FILE="$DATA_DIR/refresh-request"
LOG_FILE="$DATA_DIR/refresh.log"

# WatchPaths also fires on deletion; nothing to do then.
[ -f "$REQUEST_FILE" ] || exit 0

requested=$(head -c 200 "$REQUEST_FILE" 2>/dev/null | tr -d '\r')
# Consume the request immediately so a failure can't wedge the watcher into a
# retry loop, and a second click starts a fresh request rather than replaying.
rm -f "$REQUEST_FILE"

# macOS ships bash 3.2: no `mapfile`, and `"${arr[@]}"` on an EMPTY array is an
# "unbound variable" error under `set -u`. Keep the stage list as a plain
# space-separated string and let word-splitting build the argument list.
VALID=$("$PROJECT_DIR/scripts/refresh-cards.sh" --list | tr '\n' ' ')

stages=""
for word in $requested; do
  case " $VALID " in
    *" $word "*) stages="$stages $word" ;;
  esac
done

echo "[$(date '+%Y-%m-%d %H:%M:%S')] refresh requested: '${requested}' → running: ${stages:-<all stages>}" >> "$LOG_FILE"
# Unquoted on purpose: empty $stages must expand to NO arguments (= full
# refresh), and each surviving word is a validated stage name.
# shellcheck disable=SC2086
exec /bin/bash "$PROJECT_DIR/scripts/refresh-cards.sh" $stages
