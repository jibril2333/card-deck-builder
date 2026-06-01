#!/usr/bin/env bash
#
# Clean rebuild of the production server (port 3001) without disturbing the
# dev server (port 3000).
#
# Why this exists: running `next build` incrementally while dev shares the
# .next dir, or deleting .next only partially, can leave the served HTML
# referencing chunk hashes that no longer exist on disk -> "This page couldn't
# load". This script removes ALL production build artifacts (everything in
# .next except the dev cache) and rebuilds from scratch, then restarts prod.
#
# Usage:  bash scripts/rebuild-prod.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=3001

echo "→ stopping prod on :$PORT (dev on :3000 left running)…"
# Kill only whatever holds the prod port — leaves the dev server untouched.
lsof -ti ":$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

echo "→ removing production build artifacts (.next/prod) — dev (.next/dev) untouched…"
rm -rf .next/prod 2>/dev/null || true

echo "→ building…"
npm run build

echo "→ starting prod on :$PORT…"
nohup env PORT="$PORT" npm run start > /tmp/cdb-prod.log 2>&1 &
sleep 4

echo "✓ prod rebuilt and running at http://localhost:$PORT"
echo "  (hard-refresh the prod tab once: ⌘⇧R)"
