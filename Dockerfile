# Multi-stage build producing a minimal Next.js "standalone" runtime image.
#
# Debian-slim (not alpine): better-sqlite3 is a native addon: its install
# script tries a prebuilt binary first and falls back to compiling via
# node-gyp. Prebuilt binaries and toolchain behavior are far more reliable
# against glibc (Debian) than musl (alpine), so we avoid alpine here.
#
# distDir is dynamic (see next.config.ts): a production build always lands in
# .next.nosync/prod, so that's the fixed path we copy from below.

FROM node:22-bookworm-slim AS base

# ---- deps: install once, cached unless package*.json changes ----
FROM base AS deps
WORKDIR /app
# build-essential + python3: node-gyp fallback if better-sqlite3 has no
# prebuilt binary for this exact Node/OS/arch combination.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js app ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# CDB_DOCKER=1 makes next.config.ts use the STOCK `.next` distDir (the custom
# .next.nosync/prod path breaks output:standalone). The build script sets
# NODE_OPTIONS for the heap.
ENV CDB_DOCKER=1
RUN npm run build

# Bundle the operational scripts (scrapers, init-db, the refresh daemon) into
# plain JS. The runtime image is Next's `standalone` output: it has no tsx, no
# TypeScript and no devDependencies, so without this step none of them could
# run inside a container and the image would be a website with no way to fill
# it. better-sqlite3 stays external — it's a native addon and standalone
# already traced it in.
RUN npx esbuild scripts/*.ts \
      --bundle --platform=node --format=cjs --target=node22 \
      --outdir=scripts-dist --external:better-sqlite3 \
      --tsconfig=tsconfig.json --log-level=warning

# ---- litestream: the continuous backup, pinned ----
# Its official image is multi-arch, and each architecture of ours is built on a
# machine of that architecture, so this resolves to the right binary without a
# per-arch download URL to keep in sync.
FROM litestream/litestream:0.5.16 AS litestream

# ---- runner: copy only the standalone output + static assets ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
# With the stock `.next` distDir the standalone tree is:
#   standalone/server.js
#   standalone/.next/...            (server chunks/manifests)
#   standalone/node_modules/...     (traced deps incl. better-sqlite3)
# The static assets aren't part of standalone — copy them alongside.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts-dist ./scripts-dist
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh

# data.nosync (SQLite DBs) is bind-mounted at runtime via docker-compose —
# never baked into the image. Create the mountpoint so it exists even if the
# compose volume is momentarily absent.
RUN mkdir -p /app/data.nosync && chown nextjs:nodejs /app/data.nosync
# Continuous backup. The replica directory is a mountpoint like the data dir:
# a backup inside the dataset it is backing up is not a backup.
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
RUN mkdir -p /app/backups && chown nextjs:nodejs /app/backups

# Which commit this image was built from. Declared HERE, at the very end, so a
# new SHA invalidates only this one tiny layer — put it earlier and every build
# would recompile the app.
ARG CDB_GIT_SHA=""
ENV CDB_GIT_SHA=$CDB_GIT_SHA
# Same layer, same reason: the commit's own timestamp, so the sidebar can say
# WHEN as well as WHICH. Empty when built outside CI — the stamp then shows
# the sha alone.
ARG CDB_BUILT_AT=""
ENV CDB_BUILT_AT=$CDB_BUILT_AT

USER nextjs
EXPOSE 3001
# Bootstraps an empty database and (optionally) runs the refresh daemon before
# handing PID 1 to the server. See docker/entrypoint.sh.
# No CMD on purpose. Docker passes CMD to the ENTRYPOINT as arguments, so a
# default CMD would be indistinguishable from a command the user typed — and
# the entrypoint treats arguments as "run this instead of the server", which
# would skip the database bootstrap on every ordinary start. Verified the
# painful way: the container came up 503, "数据库文件不存在".
ENTRYPOINT ["/app/entrypoint.sh"]
