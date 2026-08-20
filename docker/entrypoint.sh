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
  CDB_DATA_DIR="$DATA_DIR" CDB_SCRIPTS_DIR="$SCRIPTS" node "$SCRIPTS/refresh-daemon.js" &
fi

# exec: the server becomes PID 1, so `docker stop` reaches it directly and
# Next.js gets its SIGTERM instead of the shell swallowing it.
exec node server.js
