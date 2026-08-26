#!/bin/sh
# Everything a fresh container needs before the server starts.
#
# The point of this file is that `docker run` with an empty volume produces a
# working site. Before it, the image was half of a deployment: the database had
# to be built on the host with npm, and the card data had to be scraped by host
# scripts driven by launchd. Neither travelled with the image, so anyone who
# pulled it got "数据库文件不存在".
set -e

DATA_DIR="${CDB_DATA_DIR:-/app/data.nosync}"
SCRIPTS="${CDB_SCRIPTS_DIR:-/app/scripts-dist}"

# Both daemons run BESIDE the server, which is PID 1, and nothing else is
# watching them. An uncaught exception in either one is invisible: the health
# check only knows about /api/health, so the site stays green while the backup
# has been stopped for three weeks and the panel shows an ever-staler "正在
# 复制". Restart them, with a pause so a daemon that fails instantly (bad
# config, missing binary) doesn't spin.
keep_alive() {
  name="$1"
  shift
  while :; do
    "$@"
    echo "[entrypoint] $name exited ($?), restarting in 5s"
    sleep 5
  done
}

# A command given on the command line runs INSTEAD of the server, with none of
# the bootstrap below — `docker run <image> ls scripts-dist`, or a one-off
# `docker run <image> node /app/scripts-dist/refresh-daemon.js --once sets`.
# Without this an ENTRYPOINT swallows the arguments and silently starts the
# server anyway, which is a confusing way to lose ten minutes.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

if [ ! -f "$DATA_DIR/digimon.db" ]; then
  echo "[entrypoint] no database in $DATA_DIR — creating one"
  CDB_DATA_DIR="$DATA_DIR" node "$SCRIPTS/init-db.js"
  echo "[entrypoint] empty card pool: the site works, but has no cards until a"
  echo "[entrypoint] refresh runs. With CDB_REFRESH_IN_CONTAINER=1 the daemon"
  echo "[entrypoint] will do it on the schedule; or trigger one now with:"
  echo "[entrypoint]   docker exec <container> node $SCRIPTS/refresh-daemon.js --once cards sets text art"
fi

# The refresh daemon. Off by default because it is WRONG on the macOS
# deployment: there the SQLite files are bind-mounted across the macOS↔VM
# boundary where POSIX locks don't propagate, and writing them from a second
# process is the documented way to corrupt the app's view of them. That host
# keeps its launchd pipeline. See scripts/refresh-daemon.ts.
if [ "${CDB_REFRESH_IN_CONTAINER:-0}" = "1" ]; then
  echo "[entrypoint] starting refresh daemon"
  keep_alive "refresh daemon" \
    env CDB_DATA_DIR="$DATA_DIR" CDB_SCRIPTS_DIR="$SCRIPTS" \
      node "$SCRIPTS/refresh-daemon.js" &
fi

# Continuous backup (Litestream). Unconditional, unlike the refresh daemon:
# replicating a database is safe wherever the container runs, and this is the
# one piece of the deployment whose absence is invisible until the day it
# matters. With nothing configured it replicates to the local directory only;
# the settings page adds the off-site copy.
echo "[entrypoint] starting backup daemon"
keep_alive "backup daemon" env CDB_DATA_DIR="$DATA_DIR" \
  node "$SCRIPTS/backup-daemon.js" &

# exec: the server becomes PID 1, so `docker stop` reaches it directly and
# Next.js gets its SIGTERM instead of the shell swallowing it.
exec node server.js
