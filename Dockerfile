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

# data.nosync (SQLite DBs) is bind-mounted at runtime via docker-compose —
# never baked into the image. Create the mountpoint so it exists even if the
# compose volume is momentarily absent.
RUN mkdir -p /app/data.nosync && chown nextjs:nodejs /app/data.nosync

USER nextjs
EXPOSE 3001
CMD ["node", "server.js"]
