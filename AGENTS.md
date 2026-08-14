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

Port 3001 is owned solely by the `card-deck-builder` Docker container. The old
native-process prod flow (LaunchAgent `com.rei.card-deck-builder` →
`scripts/serve-prod.sh` → `npm start`) used to fight it for that port; it has
been retired, disabled, and **deleted** — plist, `serve-prod.sh` and
`rebuild-prod.sh` are all gone. Don't reintroduce a second thing that binds
3001. (`launchctl print-disabled gui/501` still lists the old label as
disabled; that's a harmless leftover flag, not a service.)

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

## Refreshing card data

**Use `scripts/refresh-cards.sh` — don't run scrapers by hand against the live
DB.** It snapshots the DB, runs the scrapers against the COPY (every scraper
honours `CDB_DATA_DIR`), validates the result (`integrity_check`, and the card
count must not shrink), and only then stops the container for the ~3 seconds it
takes to swap the file in. It rolls back automatically if the new DB fails its
health check, and keeps the last 5 backups.

```
scripts/refresh-cards.sh                 # everything (prices make it ~1h)
scripts/refresh-cards.sh cards text art  # pick stages
scripts/refresh-cards.sh --list
```

Stages: `cards` (discover/import new cards) · `text` (zh+ja) · `art` (en+ja alt
arts) · `rulings` · `prices` · `restrictions`.

`scripts/sync-cards.ts` is what makes new sets appear on their own: it diffs
digimoncard.io's entire catalogue (empty `n=` query → all ~9.7k rows, no cap or
pagination) against `cards`. `MODERN_CODE` in
`src/lib/scraper/digimoncardio.ts` keeps out the 1999-era Bandai games the same
API serves (`BO-`, `DD-`, `DV-`, `MD-`, `MO-`, `DM-`, bare `ST-`).

It **never deletes**. Our TOKEN cards (BT22-TOKEN, TOKEN01, …) don't exist
upstream at all, and a transient short response from the API must not be able
to empty the DB.

It **does re-read the cards no official source covers** — no `ja` row in
`card_translations`, i.e. digimoncard.com has never returned them; 77 of 4370
today, mostly BT26 and a few LM. This used to be insert-only in the stronger
sense that an existing row was never touched again, which froze every field at
whatever the first import saw: upstream could correct a card and we would never
find out. That is how LM-033 sat filed as a Digimon for four months (see the
EN-site note below).

Undoing that is only safe for cards nothing else can speak for. This feed is a
wiki-derived mirror and is measurably WORSE than the official sites on the
fields they both carry — measured against the live DB, letting it overwrite
everything would rewrite **4287** image URLs to its own scans, lowercase
**1586** rarities, and mangle 97 names (`Gaiamon ACE` → `Gaiamon`). So the
official scrapers keep the cards they own, and this one only fills the gap
where they are silent.

Runs happen three ways:
1. **Weekly** — LaunchAgent `com.rei.cdb-refresh-weekly`, Mondays 04:30.
2. **The button** — `/[game]/admin` → "立即更新". The app only writes
   `data.nosync/refresh-request`; the host agent `com.rei.cdb-refresh-watch`
   (WatchPaths) picks it up and runs `scripts/refresh-on-request.sh`. **The
   container deliberately has no Docker socket** — it's internet-facing through
   the tunnel, so app-level RCE would otherwise mean host compromise. Don't
   "simplify" this by mounting the socket.
3. **By hand** — the command above.

Admin access is an explicit allowlist, `CDB_ADMIN_EMAILS`, set in
`~/card-deck-builder/.env.deploy` (host-only, gitignored, sourced by the deploy
workflow). It fails closed: unset means nobody is an admin. Plain "logged in"
is not enough — accounts go to friends, and a refresh restarts the container.

Progress/results land in `data.nosync/refresh-status.json` (read by the admin
UI) and `data.nosync/refresh.log`.

### Push notifications (ntfy)

`scripts/refresh-cards.sh` pushes to ntfy at the end of a run. Two cases, and
only two:

- **The data changed.** A banlist move raises the priority and leads the title,
  because it's the only change that can make a deck you already built illegal.
  A run that changed nothing sends nothing — that's most weeks, and a weekly
  "no news" push is how a channel gets muted.
- **The run failed.** Max priority. This is the case where silence is the
  actual problem: the data just quietly stops being current.

**Configured in the app** — 管理页 → 更新通知 (server / topic / token). The page
writes `data.nosync/ntfy.json` (mode 0600, holds a credential) and the HOST
script reads it: the same app-writes-a-file, host-reads-it arrangement the
schedule uses, because this container is internet-facing and doesn't get to run
things on the machine. `CDB_NTFY_URL` + `CDB_NTFY_TOKEN` in the environment
override the file, which is how the tests point it at a stand-in server.

Nothing configured = the feature is off, silently. Notification failures can
never fail a refresh: by the time one is sent, a validated database has already
been swapped in, and throwing that away over a missed push would be absurd.
See `scripts/notify-refresh.ts`; the message is built (and tested) in
`src/lib/refresh-notify.ts`, the settings shape in `src/lib/ntfy-config.ts`.

The token is write-only across the HTTP boundary: `GET /api/admin/ntfy` returns
whether one is set and a few characters of it, never the value, and saving with
the field blank keeps the stored one.

An ntfy server with `auth-default-access: deny-all` (the usual setup) needs a
write-only user for the topic. One-time, on whichever machine runs ntfy — it
involves a password and a token, so it isn't something an agent should be doing
for you:

```
docker exec -e NTFY_PASSWORD="$(openssl rand -base64 24)" ntfy \
  ntfy user add --role=user card-deck-builder
docker exec ntfy ntfy access card-deck-builder dcg write
docker exec ntfy ntfy token add --expires=never --label="cdb refresh" card-deck-builder
```

Note the ntfy container running on THIS Mac (`127.0.0.1:8093`) is not
necessarily the one behind `ntfy.raynefall.dev` — that server was moved to
another machine. Point the settings at the real one.

### ⚠️ NEVER write the SQLite DBs while the container is running

The prod container mounts `data.nosync/*.db` via a Docker **bind mount** (macOS
host ↔ Linux VM). SQLite coordinates multi-process access with POSIX advisory
(`fcntl`) locks, and **those locks do NOT propagate across that bind-mount
boundary**. So if a host process (e.g. any `scripts/scrape-digimon-*.ts`,
`sqlite3`, a migration) writes a DB in WAL mode while the container has it open,
the two connections get inconsistent WAL/shm views and the container starts
throwing `SQLITE_CORRUPT: database disk image is malformed` — even though
`PRAGMA integrity_check` on the file is still `ok`. (Happened 2026-07-24 while
back-filling promo cards; recovered by stopping the container + `wal_checkpoint`,
no data lost — but don't rely on that.)

**Safe procedure for any DB write (scrapers, migrations, manual SQL):**
```
docker stop card-deck-builder
# … run the scraper / sqlite3 / migration on the host now (single process) …
sqlite3 data.nosync/digimon.db      "PRAGMA wal_checkpoint(TRUNCATE);"
sqlite3 data.nosync/digimon-user.db "PRAGMA wal_checkpoint(TRUNCATE);"
docker start card-deck-builder
```
Data-only changes still don't need a git push (the container reads the mounted
DB live once it's the only writer) — they just need the container **stopped**
during the write.

## Card data: the shape is NOT uniform

Two things about this data broke repeatedly until they were written down, and
both look like carelessness but are structural.

**1. Card types have different field sets.** Surveyed against the official JP
site across 520 cards:

| type | prints |
|---|---|
| Digimon | colour, cost, DP, digivolve cost (some a 2nd), form, attribute, traits |
| Digi-Egg | colour, form, traits — no cost, no DP (attribute only on Appmon) |
| Tamer | colour, cost — no form, no attribute, no DP, no level |
| Option | colour, cost — same, traits on about half |
| Dual | the Digimon set, plus the Option half; its cost cell reads "D", not a number |

`src/lib/cards/digimon-fields.ts` states this as `CARD_TYPE_FIELDS`, and the
card page renders from it. It drives ORDER and GROUPING only — never
suppression. Digi-Eggs have no cost, yet BT22-007 really costs 20 and EX2-007
really has 15000 DP; `visibleFields` appends any off-model field that holds a
value so real data can't be hidden, and `scripts/audit-cards.ts` reports it.

**2. Some fields are language-specific and some aren't.** Effect text, form,
attribute and traits differ per language; levels, costs, DP and the canonical
colour run do not. `FIELD_SOURCE` says which is which, once, and
`buildCardView` is derived from it. Don't hand-write `translation.x ?? card.y`
chains — that is exactly how BT9-104 came to show its Japanese trait next to
its English attribute.

Layout must key off `canonical_type`, never the displayed `card_type` (which
may be デジモン or 数码宝贝).

### The sources disagree, and each is wrong differently

- **digimoncard.com (JP)** — the most reliable, and the authority on WHICH
  FIELDS a card has AND on WHAT TYPE a card is. `scripts/scrape-digimon-jp.ts`
  clears fields this site doesn't print for a card it returned, and rewrites
  `cards.card_type` from its verdict via `canonicalJpType` (a closed
  vocabulary of five words — an unlisted one warns and changes nothing, since
  a wrong guess overwrites a correct type and is not recoverable). It runs LAST
  of the text stages, so it gets the final word over the EN site. Cards it
  doesn't carry are untouched.
- **world.digimoncard.com (EN)** — authoritative for English wording, but not
  complete and not always right: it omits EX10-012's security effect entirely,
  prints a digivolve cost on Tamers that have none, labels the same trait
  "Attribute" where JP calls it a Type, and **gets the card TYPE wrong** — it
  calls all twelve of LM-027…038 (the Scramble and Memory Boost! cards)
  "Digimon" when they are Options. Do NOT treat its silence as fact — I tried
  making it authoritative for all text blocks and it deleted four cards' real
  English text.
- **digimoncard.io** — a wiki-derived mirror, the only source for sets neither
  official site has published. It has ONE "second effect block" and routes it
  by card type, so the same text lands in whichever slot that implies; it leaks
  wiki markup and its own block labels into card text; and it puts a Dual
  card's Option-side cost in `play_cost`.
- **dtcgweb-api.digimoncard.cn** — Chinese text. Has no field for
  digivolve/DigiXros conditions, Dual halves or Link blocks, and inlines all of
  them into the effect bodies; `src/lib/scraper/digimon-cn.ts` splits them back
  out.

`COALESCE(NULLIF(excluded.x, ''), x)` in the upserts exists so a source that
CAN'T see a block never erases what another found. Be aware of the flip side:
when the bad value comes from the mirror and the official block is legitimately
empty, that guard makes the bad value permanent. Several rounds of bugs were
exactly this.

### Checking the data

```
npx tsx scripts/audit-cards.ts              # every set, both official sites
npx tsx scripts/audit-cards.ts --only=BT25
```

Read-only. Three-way (us / EN / JA), because two-way can't tell a bug from a
decision. Run it after a refresh — it is the only thing that can answer "is
anything else wrong?" with a number instead of a guess.

### Manual Docker operations (rarely needed — CI does this automatically)

- Rebuild + redeploy by hand: `docker compose build && docker compose up -d`
- Logs: `docker compose logs -f`
- The runner service: `cd ~/actions-runner && ./svc.sh status|start|stop`
- **Known gap**: Docker Desktop's own "Start Docker Desktop when you log in"
  setting is OFF. A full reboot will NOT bring the container back until
  someone opens Docker Desktop (or flips that toggle in Docker Desktop →
  Settings → General). Login-only restarts are unaffected — Docker Desktop
  itself keeps running across those.
