<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Location & environment

The repo lives at **`~/card-deck-builder`**. It was moved here (COPIED, then the
original trashed via Finder) out of iCloud-synced `~/Desktop`, where iCloud had
trashed live SQLite folders, evicted file contents to 0-byte "dataless" stubs
(silently breaking `next build`), and choked disk I/O (a full build took ~7 min
wall / ~24 s CPU). Outside iCloud those problems are gone — the same build is
now ~17 s.

- `data.nosync/` (SQLite DBs + backups) and `.next.nosync/` (build output): the
  `.nosync` suffix is now vestigial (nothing evicts these anymore) but kept —
  renaming would be churn for no gain, and next.config.ts's distDir + trace
  excludes reference them.
- `node_modules` must stay a REAL directory (never a symlink): a symlinked
  node_modules breaks Next's `serverExternalPackages` match for better-sqlite3,
  webpack bundles it, and the native `better_sqlite3.node` fails to load at
  runtime. If deps break (CLIs exit 0 silently / TransformError / "package
  could not be found"), repair = `npm ci`.
- `~/Desktop` is macOS-privacy-protected AND was iCloud-managed, so a shell
  gets EPERM trying to `mv`/`rm` items out of it — that's why the move was a
  copy and the stale `~/Desktop/Workspace/card-deck-builder` had to go via
  Finder.

## Local servers

- **3000** = dev (`npm run dev`) — start manually when developing.
- **3001** = prod — **auto-started on login** by the LaunchAgent
  `com.rei.card-deck-builder` (`~/Library/LaunchAgents/`), which runs
  `scripts/serve-prod.sh` (reuses the existing `.next.nosync/prod` build,
  building only if there is none). This is what the Cloudflare tunnel serves;
  `KeepAlive` respawns it if it dies.

**After a meaningful code change (feature / stage / bug-fix — not every Edit),
redeploy prod:**

1. **`rm -rf .next.nosync/prod && npm run build`** — always build from a clean
   prod dir (incremental build leaves stale chunk hashes → ChunkLoadError).
   NEVER run this while `npm run dev` is going — they thrash disk I/O and the
   build stalls indefinitely. Kill dev first if needed.
2. Restart the launchd-managed prod so it serves the new build:
   **`launchctl kickstart -k gui/501/com.rei.card-deck-builder`**
   (a plain `kill` won't do it — KeepAlive respawns the OLD build; `kickstart -k`
   re-runs serve-prod.sh). Verify `:3001` is listening + HTTP 200.
3. If dev needs the new code too, `kill` its parent `npm run dev` and relaunch
   `npm run dev` in the background.
