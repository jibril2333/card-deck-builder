<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## iCloud is hostile to this project

The repo lives in iCloud-synced ~/Desktop. iCloud has (a) moved live SQLite
folders to its trash, (b) evicted file contents leaving 0-content "dataless"
stubs (`ls -lO` shows `dataless`; reads return EMPTY, they do NOT
auto-materialize), which silently broke `next build` and emptied DB backups.
Defenses — keep all of these intact:

- `data.nosync/` — all SQLite DBs + backups (`.nosync` suffix = iCloud ignores)
- `.next.nosync/` — build output

`node_modules` must stay a REAL directory. The symlink-to-`.nosync` trick was
tried and REVERTED: with a symlinked node_modules, Next's
`serverExternalPackages` no longer matches better-sqlite3 (realpath mismatch),
webpack bundles it, and the native `better_sqlite3.node` fails to load at
runtime (bindings searches inside `.next.nosync/prod/`). If iCloud evicts
node_modules again (symptom: CLIs exit 0 silently / TransformError /
"package could not be found"), repair = `npm ci`. Build traces are excluded
from the `.nosync` dirs in next.config.ts and the build script raises the
heap — keep both.

Root cause of the aggressive eviction: the disk runs low on free space
(~20GB), so macOS "Optimize Mac Storage" evicts iCloud-synced files
constantly. The durable fix is moving the repo out of ~/Desktop entirely.

If a file mysteriously reads as empty, check `ls -lO` for `dataless` and run
`brctl download <path>` — but files renamed into a `.nosync` dir while still
dataless are orphaned and unrecoverable locally (server copy may be in
iCloud.com → Recently Deleted for 30 days).

## Local servers

The owner runs two parallel servers locally:

- **3000** = dev (`npm run dev`)
- **3001** = prod (`npm run build && npm start -- -p 3001`)

**After completing any code change session, restart both** so the owner can see the new code immediately without manual steps:

1. `lsof -iTCP:3000 -sTCP:LISTEN` + `lsof -iTCP:3001 -sTCP:LISTEN` to find PIDs
2. Walk up to parent `npm run dev` / `npm run start` processes (use `ps -o pid,ppid -p <pid>`) and `kill` those — that releases both worker PIDs cleanly
3. **`rm -rf .next.nosync/prod`** — incremental `next build` over a populated dir leaves stale chunk hashes; the served HTML references chunks that no longer exist on disk → ChunkLoadError. Always start from a clean prod dist dir. (Build output lives under `.next.nosync/` so macOS iCloud — the project sits in an iCloud-synced folder — can't create `server 2/` conflict copies that break `next start`.)
4. `npm run build` (rebuilds 3001 from scratch)
5. `npm run dev` in background (3000)
6. `npm start -- -p 3001` in background (3001)
7. Verify both ports are listening before reporting done

"Code change" here means a meaningful unit (a feature, a stage, a bug-fix), not every individual Edit. Don't restart between intermediate edits.
