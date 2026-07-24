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
- **3001** = prod — runs in **Docker** (see "Production deployment" below).
  This is what the Cloudflare tunnel serves.

The OLD native-process prod flow (LaunchAgent `com.rei.card-deck-builder` →
`scripts/serve-prod.sh` → `npm start`) has been **retired, unloaded, and
permanently disabled** (`launchctl bootout` + `launchctl disable
gui/501/com.rei.card-deck-builder`) so it no longer respawns on login and
fights Docker for port 3001. Port 3001 is now solely owned by the
`card-deck-builder` Docker container. The plist and script are left in place
for reference/rollback only; to revive it you'd have to `launchctl enable` +
`bootstrap` it — don't, while Docker holds 3001 (port conflict).

The container runs as **`user: "501:20"`** (the host owner) — see the comment in
`docker-compose.yml`. This is required: the SQLite DBs are bind-mounted from the
host and owned by uid 501, so the image's built-in `nextjs` (1001) user could
only READ them and every write (deck edits, collection changes, scraper runs)
would silently fail.

**After a meaningful code change (feature / stage / bug-fix — not every Edit),
just push to `main`** — a GitHub Actions workflow
(`.github/workflows/deploy.yml`) running on a self-hosted runner on this same
Mac rebuilds the Docker image and redeploys automatically:

1. `git push origin main` (only the repo owner can — sole collaborator).
2. The push triggers `.github/workflows/deploy.yml` on the self-hosted runner
   (registered as the user-level LaunchAgent
   `~/Library/LaunchAgents/actions.runner.jibril2333-card-deck-builder.cdb-mac-mini.plist`,
   itself always-on). It runs `docker compose build && docker compose up -d`,
   waits for `:3001` to answer, then prunes dangling images.
3. Watch it with `gh run watch` (or `gh run list` for recent runs). Verify
   `docker ps` shows a freshly-`Created` container and `curl localhost:3001`
   returns 200.

**Do NOT add `pull_request` / `pull_request_target` triggers to that
workflow.** This repo is public; a self-hosted runner executing untrusted PR
code would hand out arbitrary code execution on this Mac. `push` to `main` is
safe only because the owner is the sole collaborator with push access —
re-verify that invariant (`gh api repos/{owner}/{repo}/collaborators`) before
ever loosening the trigger.

If dev (3000) needs the new code too: `kill` its parent `npm run dev` process
and relaunch `npm run dev` in the background — that flow is unchanged.

### Manual Docker operations (rarely needed — CI does this automatically)

- Rebuild + redeploy by hand: `docker compose build && docker compose up -d`
- Logs: `docker compose logs -f`
- The runner service: `cd ~/actions-runner && ./svc.sh status|start|stop`
- **Known gap**: Docker Desktop's own "Start Docker Desktop when you log in"
  setting is OFF. A full reboot will NOT bring the container back until
  someone opens Docker Desktop (or flips that toggle in Docker Desktop →
  Settings → General). Login-only restarts are unaffected — Docker Desktop
  itself keeps running across those.
