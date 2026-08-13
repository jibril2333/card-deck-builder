#!/bin/bash
#
# Refresh the Digimon card database with (near-)zero downtime.
#
# Why it's shaped like this: the prod container mounts data.nosync/*.db over a
# Docker bind mount, and SQLite's POSIX locks do NOT cross the macOS↔VM
# boundary. Writing the live DB from the host while the container has it open
# gives the container a torn WAL view and it starts throwing
# "SQLITE_CORRUPT: database disk image is malformed" — the site serves error
# pages even though `PRAGMA integrity_check` on the file still says ok.
# (Happened 2026-07-24.) So every scraper writes a COPY, and the container is
# only stopped for the couple of seconds it takes to swap the file in.
#
# Usage:
#   scripts/refresh-cards.sh              # default: full refresh
#   scripts/refresh-cards.sh cards        # discover/import new cards only
#   scripts/refresh-cards.sh cards text art
#   scripts/refresh-cards.sh --list       # show available stages
#
# Stages: cards (sync-cards) · text (zh+ja translations) · art (en+ja alt arts)
#         keywords (official keyword vocabulary) · rulings · prices · restrictions
#
# Exit codes: 0 ok · 1 failure (live DB untouched or rolled back) · 2 bad usage
#             3 another run holds the lock

set -uo pipefail

PROJECT_DIR="${CDB_PROJECT_DIR:-$HOME/card-deck-builder}"
DATA_DIR="$PROJECT_DIR/data.nosync"
LIVE_DB="$DATA_DIR/digimon.db"
CONTAINER="${CDB_CONTAINER:-card-deck-builder}"
HEALTH_URL="${CDB_HEALTH_URL:-http://localhost:3001/api/health}"
# Docker Desktop's CLI isn't on a LaunchAgent's minimal PATH.
export PATH="/Applications/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

WORK_DIR="$DATA_DIR/.refresh-work"
LOCK_DIR="$DATA_DIR/.refresh.lock"
STATUS_FILE="$DATA_DIR/refresh-status.json"
LOG_FILE="$DATA_DIR/refresh.log"

ALL_STAGES=(cards text art keywords rulings prices restrictions)

if [ "${1:-}" = "--list" ]; then
  printf '%s\n' "${ALL_STAGES[@]}"
  exit 0
fi

STAGES=("$@")
[ ${#STAGES[@]} -eq 0 ] && STAGES=("${ALL_STAGES[@]}")
for s in "${STAGES[@]}"; do
  case " ${ALL_STAGES[*]} " in
    *" $s "*) ;;
    *) echo "unknown stage: $s (try --list)" >&2; exit 2 ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ---- status file (read by the app's admin UI) -------------------------------
# `trigger` says which of the two paths started this: the scheduler
# (scripts/refresh-tick.ts, CDB_REFRESH_TRIGGER=auto) or a person pressing the
# button. They run the same pipeline with different stage sets, and when one of
# them fails you want to know which one without reading the log.
STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
write_status() { # state, message
  local state="$1" msg="$2"
  # Written atomically: the UI polls this and must never read a half-file.
  cat > "$STATUS_FILE.tmp" <<EOF
{
  "state": "$state",
  "message": $(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/'),
  "stages": "${STAGES[*]}",
  "trigger": "${CDB_REFRESH_TRIGGER:-manual}",
  "startedAt": "$STARTED_AT",
  "updatedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
EOF
  mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
}

# ---- single-run lock --------------------------------------------------------
# mkdir is atomic; a stale lock from a killed run is cleared by hand.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "another refresh is already running (lock: $LOCK_DIR) — aborting"
  exit 3
fi

FAILED_STAGE=""
cleanup() {
  local rc=$?
  rmdir "$LOCK_DIR" 2>/dev/null || true
  rm -rf "$WORK_DIR" 2>/dev/null || true
  if [ $rc -ne 0 ]; then
    write_status "failed" "${FAILED_STAGE:-refresh} failed (exit $rc); live database untouched"
    log "FAILED (exit $rc)"
  fi
}
trap cleanup EXIT

cd "$PROJECT_DIR" || { echo "no project dir: $PROJECT_DIR" >&2; exit 1; }

log "=== refresh start: ${STAGES[*]} ==="
write_status "running" "starting: ${STAGES[*]}"

# ---- 1. snapshot ------------------------------------------------------------
rm -rf "$WORK_DIR"; mkdir -p "$WORK_DIR"
log "snapshotting live DB → work copy"
# .backup takes a consistent snapshot even with the container reading the file.
if ! sqlite3 "$LIVE_DB" ".backup '$WORK_DIR/digimon.db'"; then
  FAILED_STAGE="snapshot"; exit 1
fi
# A SECOND snapshot of the same moment, kept untouched as the "before" side of
# the changelog. Taken here rather than diffing against the live DB later so the
# comparison never touches a file the container has open, and never lands inside
# the swap's downtime window.
if ! sqlite3 "$LIVE_DB" ".backup '$WORK_DIR/before.db'"; then
  FAILED_STAGE="snapshot"; exit 1
fi
# Some scrapers resolve sibling DBs through CDB_DATA_DIR; give them a real one.
[ -f "$DATA_DIR/digimon-user.db" ] && \
  sqlite3 "$DATA_DIR/digimon-user.db" ".backup '$WORK_DIR/digimon-user.db'"

export CDB_DATA_DIR="$WORK_DIR"

# The scrapers open the copy directly with better-sqlite3 — they never go
# through the app, which is what normally applies migrations. Migrate the copy
# first so a schema change can't land in the same release as a refresh and kill
# it with "no such column".
log "migrating work copy"
write_status "running" "migrating"
if ! npx tsx scripts/migrate.ts >>"$LOG_FILE" 2>&1; then
  log "migration of the work copy FAILED (see $LOG_FILE)"
  FAILED_STAGE="migrate"; exit 1
fi

run() { # stage-name, command…
  local name="$1"; shift
  log "--- $name ---"
  write_status "running" "$name"
  if ! "$@" >>"$LOG_FILE" 2>&1; then
    log "$name FAILED (see $LOG_FILE)"
    FAILED_STAGE="$name"
    return 1
  fi
  log "$name ok"
}

TSX="npx tsx"
for stage in "${STAGES[@]}"; do
  case "$stage" in
    cards)   run cards        $TSX scripts/sync-cards.ts || exit 1 ;;
    text)    # Official EN first: digimoncard.io (the `cards` stage) is a
             # community mirror and gets structure wrong — most visibly it has
             # no notion of a Dual card's second face and dumps it into
             # inherited_effect. The official site is authoritative and repairs
             # that, so it must run after `cards`, not before.
             run text-en      $TSX scripts/scrape-digimon-metadata.ts || exit 1
             run text-zh      $TSX scripts/scrape-digimon-cn.ts || exit 1
             run text-ja      $TSX scripts/scrape-digimon-jp.ts || exit 1 ;;
    art)     run alt-arts     $TSX scripts/scrape-digimon-alt-arts.ts || exit 1 ;;
    keywords)
             run keywords     $TSX scripts/scrape-digimon-keywords.ts || exit 1 ;;
    rulings) run rulings      $TSX scripts/scrape-digimon-rulings.ts || exit 1 ;;
    prices)  run prices       $TSX scripts/scrape-cardrush-prices.ts || exit 1 ;;
    restrictions)
             run restrictions $TSX scripts/scrape-restrictions.ts || exit 1 ;;
  esac
done

# ---- 2. validate the work copy BEFORE it can touch prod ---------------------
log "validating work copy"
write_status "running" "validating"
if [ "$(sqlite3 "$WORK_DIR/digimon.db" 'PRAGMA integrity_check')" != "ok" ]; then
  log "work copy failed integrity_check — NOT swapping"
  FAILED_STAGE="validate"; exit 1
fi
new_cards=$(sqlite3 "$WORK_DIR/digimon.db" "SELECT COUNT(*) FROM cards")
old_cards=$(sqlite3 "$LIVE_DB" "SELECT COUNT(*) FROM cards")
# A refresh must never lose cards. Anything shrinking means a scraper wrote
# garbage, and swapping it in would take the site down with it.
if [ "$new_cards" -lt "$old_cards" ]; then
  log "work copy has FEWER cards ($new_cards < $old_cards) — NOT swapping"
  FAILED_STAGE="validate"; exit 1
fi
sqlite3 "$WORK_DIR/digimon.db" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
log "work copy ok ($old_cards → $new_cards cards)"

# ---- 2b. what changed -------------------------------------------------------
# Written INTO the work copy, so the changelog rides along with the database
# being swapped in. Never fatal: a refresh that scraped fine must not be thrown
# away because the bookkeeping failed.
CHANGES_JSON=""
if CHANGES_JSON=$(npx tsx scripts/diff-refresh.ts \
      "$WORK_DIR/before.db" "$WORK_DIR/digimon.db" \
      --run-at="$STARTED_AT" 2>>"$LOG_FILE" | tail -1); then
  log "changelog: $CHANGES_JSON"
else
  log "changelog FAILED (not fatal — see $LOG_FILE)"
  CHANGES_JSON=""
fi
sqlite3 "$WORK_DIR/digimon.db" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null

# ---- 3. swap (the only downtime) --------------------------------------------
BACKUP="$DATA_DIR/digimon.db.bak-$(date '+%Y%m%d-%H%M%S')"
was_running=0
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true && was_running=1

write_status "running" "swapping database"
if [ $was_running -eq 1 ]; then
  log "stopping container"
  docker stop "$CONTAINER" >/dev/null || { FAILED_STAGE="swap"; exit 1; }
fi

cp "$LIVE_DB" "$BACKUP" || { FAILED_STAGE="swap"; exit 1; }
if cp "$WORK_DIR/digimon.db" "$LIVE_DB"; then
  rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
  log "swapped in new DB (backup: $(basename "$BACKUP"))"
else
  log "copy failed — restoring backup"
  cp "$BACKUP" "$LIVE_DB"
  FAILED_STAGE="swap"
  [ $was_running -eq 1 ] && docker start "$CONTAINER" >/dev/null
  exit 1
fi

if [ $was_running -eq 1 ]; then
  log "starting container"
  docker start "$CONTAINER" >/dev/null
  # ---- 4. verify, and roll back if the new DB doesn't actually serve --------
  ok=0
  for _ in $(seq 1 30); do
    if curl -fs "$HEALTH_URL" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
  done
  if [ $ok -ne 1 ]; then
    log "health check FAILED after swap — rolling back"
    docker stop "$CONTAINER" >/dev/null
    cp "$BACKUP" "$LIVE_DB"
    rm -f "$LIVE_DB-wal" "$LIVE_DB-shm"
    docker start "$CONTAINER" >/dev/null
    FAILED_STAGE="verify"
    exit 1
  fi
  log "health check ok"
fi

# Keep the 5 most recent refresh backups.
ls -1t "$DATA_DIR"/digimon.db.bak-* 2>/dev/null | tail -n +6 | while read -r f; do
  rm -f "$f"; log "pruned old backup $(basename "$f")"
done

write_status "ok" "$old_cards → $new_cards cards"
log "=== refresh done ($old_cards → $new_cards cards) ==="
exit 0
