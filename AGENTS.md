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

## Where it runs

- **3000** = dev (`npm run dev`) on this Mac — start manually when developing.
  It reads `data.nosync/`, which is a working copy: the real data lives on the
  NAS. Nothing here serves anyone but you.
- **Production is the NAS**, in Docker, behind the Cloudflare tunnel
  (`deck.raynefall.dev`), reachable on the tailnet as `<NAS>:3001`.
  `docker-compose.nas.yml` is the only compose file.

The Mac used to run production too — a container on 3001, a self-hosted GitHub
Actions runner, and two launchd agents driving the refresh. All of it is gone;
`deploy.yml`, `docker-compose.yml`, `refresh-cards.sh`, `refresh-tick.ts` and
`refresh-on-request.sh` went with it. **Don't reintroduce a host-side pipeline**
— everything the deployment needs now lives inside the image, which is what
lets someone else run this at all.

**After a meaningful code change (feature / stage / bug-fix — not every Edit),
just push to `main`.** `.github/workflows/image.yml` builds both architectures,
publishes to ghcr, and asks watchtower on the NAS to take the new image; it
then waits until `/api/health` reports the SHA it just built, so a green run
means that build is actually serving.

- Watch it with `gh run watch`, or check `curl -s <NAS>:3001/api/health`.
- The runner is GitHub-hosted. **Never** add a self-hosted runner or a
  `pull_request` trigger to a public repo — that hands arbitrary code execution
  to anyone opening a PR.
- Watchtower recreates the container from its EXISTING configuration plus the
  new image. Mounts, `user:`, environment: none of those change until someone
  runs `docker compose up -d` on the NAS.

## Refreshing card data

**Go through the daemon — don't run scrapers by hand against a live DB.** It
takes a full snapshot first (`.refresh-before.db`, the changelog's "before"
side and a restore point), runs the stages in order, and writes progress where
the settings page can read it.

```
# on the NAS
docker exec card-deck-builder node /app/scripts-dist/refresh-daemon.js --once
docker exec card-deck-builder node /app/scripts-dist/refresh-daemon.js --once cards text art
# from a checkout (dev database)
npx tsx scripts/refresh-daemon.ts --once cards
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

Runs happen three ways, all of them inside the container:
1. **On a schedule** — `scripts/refresh-daemon.ts` ticks every minute and fires
   when the settings page's schedule says so. That schedule is arithmetic in
   LOCAL time, so the container needs `TZ` (compose sets it).
2. **The button** — 设置 → "立即更新". The app only writes
   `data.nosync/refresh-request`; the daemon picks it up on its next tick.
   **The container deliberately has no Docker socket** — it is internet-facing
   through the tunnel, so app-level RCE would otherwise mean host compromise.
   Don't "simplify" this by mounting the socket.
3. **By hand** — `docker exec <container> node /app/scripts-dist/refresh-daemon.js --once cards sets`.

Admin access is an explicit allowlist, `CDB_ADMIN_EMAILS`, set in the NAS's
`.env`. It fails closed: unset means nobody is an admin. Plain "logged in" is
not enough — accounts go to friends, and a refresh is an hour of scraping.

Progress/results land in `data.nosync/refresh-status.json` (read by the admin
UI) and `data.nosync/refresh.log`.

### The refresh writes the live database

`scripts/refresh-daemon.ts` runs beside the server and the scrapers write the
live file — no staging copy, no swap, no Docker socket. That is what makes the
image self-contained: pull it, mount an empty directory, and the entrypoint
creates the database while the daemon fills it.

What that gives up is "throw the whole scrape away if it turned out bad", since
writes land as they happen. Standing in for it: each scraper already refuses
per set (`sanityOk` blocks a write when a set comes back empty or malformed —
six days of BT26 entries in refresh.log are it working), and a full snapshot is
taken before every run as `.refresh-before.db`, which is both the changelog's
"before" side and a restore point.

The precondition is a filesystem whose locks are real — a Linux host with a
local disk. See the warning below for what happens on a macOS bind mount.

### The keyword table updates itself; only the write-up is by hand

游戏知识 used to print a hand-written list, so a new set's keywords were
missing until someone noticed. Now the rows come from `card_keywords` (scraped
from the official search dropdown by the 关键词 stage), and the ja / zh
spellings from `keyword_names`.

Nothing joins the three official lists — the EN page says "Detach", the JA page
says 分離《特徴「セブンコード」》 — so `lib/keyword-derive.ts` pairs them by
reading the cards: the term that appears on the same cards, scored by F1 so a
keyword printed on six cards is not matched to ≪ブロッカー≫ just because that is
everywhere. Below 0.34 it returns nothing: a blank is a gap, a confident wrong
translation is a lie, and this runs unattended. Measured against the 45
hand-checked pairs in `lib/keywords.ts`: 40 exact, 5 blank, 0 wrong
(`tests/keyword-derive.test.ts` fails on any wrong one).

What is still hand-written is the Chinese explanation in `lib/keywords.ts`. A
keyword with none renders as a row with its three spellings and no paragraph —
which is why no test demands one.

### Refresh progress

`refresh-status.json` (written by the daemon) says which stage is running;
`refresh-progress.json` (written by whichever script is walking a list) says
how far into it. Two files, one writer each — the daemon and its child process
would otherwise be writing the same file.

Every stage reports: each script calls `reportProgress()` over whatever it
actually walks — set prefixes for the EN/JP text scrapes, pages for the CN
feed, cards for the art probe and the two price scrapes, phases for the ones
that are a single request plus a write (卡表, 卡包, 禁限). `tests/
refresh-stages.test.ts` fails if a script in a stage has no `reportProgress`
call and if it has no entry in `SCRIPT_LABELS`, which is what the panel shows
after the stage name — 中/日文 is three scripts and the count restarts at each.

Reports are forced (unthrottled) in the loops where one iteration is one
network round trip; the throttle is for the two loops that run thousands of
times.

`lib/refresh-progress.ts` is both ends: `reportProgress()` for the scripts
(throttled to 1/s, `force` for the first and last call), `readProgress()` for
the admin route, which ignores anything older than five minutes — a killed
scrape leaves its last count behind, and a number that stopped moving is worse
than no number. The panel combines the two into one bar: stage k of n, with the
current stage's own share filled in.

An e2e that needs to plant either file reads the server's data directory from
`tests/e2e/.datadir` (written by global-setup). A spec's own `CDB_DATA_DIR`
points somewhere else — playwright.config.ts is evaluated once per process and
each evaluation makes its own fixture directory.

### The cart script

Purchase mode offers a snippet that fills PAO's cart with what the deck still
needs. Three facts shape it:

- A cart lives in a session on **the shop's** domain. The server can't reach
  it, and neither can a page on this site — `/api/cart/` is same-origin. So the
  reader runs the snippet on PAO themselves, in their own browser.
- What the cart API takes is the shop's product id, which is why the PAO scrape
  stores `external_prices.item_code` (migration 41) beside the price. Cards
  with no id, or out of stock, are simply left out.
- It adds and nothing else. `tests/cart-script.test.ts` pulls every fetch URL
  and every `action` out of the generated text and asserts they are exactly
  `/api/cart/` and `add` — checkout stays a thing a person does.

`lib/cart-script.ts` builds the text; `CartScriptButton` copies it. Quantities
are the shortfall (wanted − bought) and the price shown on the button is the
same band the price scrape uses.

### A deck card's price: typed, or the cheaper shop

`getDeckCards` returns three columns, and the difference between them is the
point:

- `manual_price` — what a person typed (the deck owner's row, or the legacy
  global one).
- `market_price` / `market_source` — the cheapest base-printing quote across
  **both** shops, in-stock preferred.
- `price` — the first of those, and what every total counts.

The tile binds the input's *value* to `manual_price` and its *placeholder* to
`market_price`: an empty box showing a grey 180 says "this is the number in
force", where the old behaviour — the market price as the value — looked like
something someone had chosen. Blur only saves when the text actually changed,
so tabbing through a deck still writes nothing.

### Two price sources

`external_prices` is keyed by `(source, card_id, variant_type)`, and two shops
are scraped into it:

- **cardrush** — `scrape-cardrush-prices.ts`, per-illustrator listings plus the
  kana readings (see below).
- **pao** — `scrape-pao-prices.ts`, pao-onlineshop.com. One quote per printing,
  no illustrator split.

PAO's site-wide search is fuzzy — `BT15-076` also returns `DZ-BT15/076` from
another game — so the scrape searches **inside the Digimon category**
(`/view/search?search_keyword=<code>&search_category=DC`), which is the shop's
own refine form. `parsePaoSearchPage` still drops anything whose name does not
contain the code, as a backstop. A discounted item carries both `通常価格` and
`特価価格`; the sale price is the one taken. Condition and printing are read off
the product name:
`（傷あり）` damaged, `【プレイ用】` played, unmarked mint, `（パラレル）` alt
art. The headline price is the best condition available, not the cheapest
listing: a 傷あり copy at ¥140 is not the price of a card you would sleeve up.

Both run in the 价格与读音 stage, one after the other, which is why that stage
now says ~2 hours. Each skips anything priced in the last 72h (`--max-age`,
`--force`).

### The kana readings ride along with the price scrape

Japanese card names print furigana over their kanji, and **no official source
carries it** — the JP card list has no reading field, digimoncard.io is English
only, and the CN API is Chinese. So 「やがみたいち」 could not find 八神太一 at
all.

The readings come from Cardrush, which puts a katakana spelling in each
product's `model_number` for its own search — the same pages
`scrape-cardrush-prices.ts` already downloads, so this costs no extra request.
`parseCardrushNameKana()` strips the shop's noise (`〔状態A-〕`, `(パラレル)`)
and takes the spelling most listings agree on, because hand-entered data has
typos: BT10-090 is listed as both ツルギゼンジロウ and ツルギゼンシロウ.

It lands in `card_translations.name_kana` (ja rows only, and only where a row
already exists — this pass is about prices, not about inventing names). The
search then matches it alongside `name`, together with the hiragana/katakana
conversion in `lib/kana`. A fresh database has the column but no values until
a price pass has run.

### A redeploy pauses a refresh; it does not fail it

A refresh runs inside this container, and watchtower replaces the container the
moment a new image lands — mid-run, several times on a busy day. What happens
now:

- `refresh()` writes `refresh-resume.json` (the stages not yet reached) as each
  stage starts, and deletes it when the run reaches its own end — success or a
  failed script alike.
- The daemon reads that file at startup, before its first tick, and finishes
  what is left (`trigger: "resume"`). Scrapes are upserts and the price ones
  skip anything fetched in the last 72h, so re-entering a half-done stage is
  cheap.
- The admin route reads the same file: a status still saying "running" with no
  lock is a crash *unless* a resume file is there, in which case it reports
  **已暂停,重启后继续**.

There is deliberately no SIGTERM handler. The scrapes run through `spawnSync`,
which blocks the daemon's event loop for the length of the scrape, and the
daemon is not PID 1 anyway — the entrypoint backgrounds it and execs the
server. An interruption is detected after the fact, by the file, not by being
told.

### Prices are resumable; a redeploy will interrupt a refresh

`scrape-cardrush-prices.ts` skips cards priced within `--max-age` hours
(default 72; `--force` re-checks everything). This is not a speed tweak — a
full pass is ~4400 requests at 700ms, over an hour, and **anything that
restarts the process inside that window used to throw the whole hour away**.

That is a routine event on the container deployment: every push rebuilds the
image, watchtower recreates the container, and whatever refresh was running
dies with it. Three consecutive price runs on the NAS died this way on
2026-08-20 — the log shows each one starting and then simply stopping, with no
`FAILED` line, because nothing was left alive to write one.

With the window, an interrupted run costs the tail rather than the whole pass,
and a daily run costs almost nothing. Cards cardrush has no listing for (~115)
are re-checked every run, since "we looked and found nothing" isn't recorded —
that's about two minutes, and worth it to pick them up when they do appear.

### Push notifications (ntfy)

The refresh pushes to ntfy at the end of a run (`scripts/notify-refresh.ts`).
Two cases, and only two:

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

### Running it on a LAN, and the container's clock

Three things the published image needs told, and each one fails silently if it
isn't:

- **`CDB_INSECURE_COOKIES=1`** — only when the app is reached over plain http
  (`http://nas:3001`). The image sets `NODE_ENV=production`, so the session
  cookie carries `Secure`, and a browser DISCARDS a Secure cookie that arrives
  over http: login succeeds, the site says you're signed out, nothing logs
  anything. HTTPS in front (tunnel, reverse proxy) needs no flag and is the
  better answer; this one is for a trusted LAN with no HTTPS to be had.
- **`TZ`** — the refresh schedule is arithmetic in local time, and a container
  is on UTC unless told otherwise, so "04:30" in the settings page fires at
  13:30 JST. Both compose files set it (`CDB_TZ`, default Asia/Tokyo) and the
  panel prints the zone it is scheduling in.
- **`init: true`** — the entrypoint runs two daemons beside the server, which
  is PID 1 and does not reap orphans. It also restarts them in a loop now: an
  uncaught exception in either used to be invisible, because the health check
  only knows about `/api/health` and would keep reporting a healthy site whose
  backup had been stopped for weeks.

### Backups (Litestream)

The user database — decks, collection, prices, accounts — is replicated
continuously by **Litestream**, started by `docker/entrypoint.sh` and supervised
by `scripts/backup-daemon.ts`. Two replicas:

**Litestream 0.5 allows exactly ONE replica per database** — configure two and
it refuses to start with "multiple replicas on a single database are no longer
supported", which is a dead backup, not a warning. So:

- **The replica is R2** when 设置 → 备份 has a bucket and a key pair, and a
  local directory otherwise. Off-site wins, because same-machine is what the
  snapshots below already cover.
- **The local directory** (`/app/backups`, mapped by compose to
  `CDB_BACKUP_DIR`) is picked by the daemon every tick (`pickReplicaDir`): the
  mount if it is writable, otherwise `<data>/backups/litestream` with the fix
  in the status line. It has to work for someone who just pulled the image, so
  compose defaults it to a NAMED VOLUME — a fresh one takes the image
  directory's mode (1777) and is writable whatever uid `user:` runs as.
- **Hourly `VACUUM INTO` snapshots**, kept every hour for two days then one a
  day for a month (~30 MB), in `<replica dir>/snapshots`. These are the copies
  that need no credentials, no network and no Litestream to restore — `cp` is
  enough — and they are what stands behind the off-site replica when the
  off-site replica is the broken thing.

Timings live in `src/lib/backup-config.ts`. Sync depends on where the replica
is (1s local, 10s R2 — that caps R2 at ~26k PUTs/month against a free tier of a
million).
**Snapshot interval and retention are global in Litestream 0.5**, not per
replica, so both share one policy: 12h snapshots, 30 days kept.

Two things the daemon does that a config file can't:

- **Says whether it is working.** `backup-status.json` (what the panel shows)
  carries the newest LTX timestamp from the local replica and the last ERROR
  Litestream logged — an unreachable R2 keeps the process alive and the local
  copy fresh, so nothing else would notice.
- **Restores.** Once a week it restores the newest copy to a temp file, runs
  `integrity_check` and counts decks. A backup nobody has restored is a rumour.
  Failures (and a crash-looping Litestream) go to ntfy at priority 4.

`node scripts-dist/backup-daemon.js --verify` runs that drill on demand.

The user database is in **WAL** mode because of this (`connection.ts` sets it on
the ATTACHed file; the bare `journal_mode = WAL` only covers the card DB).
Litestream replicates by streaming the WAL — in rollback mode there is nothing
to stream.

### ⚠️ A migration that touches `user.*` must be idempotent

`PRAGMA user_version` lives on the **cards** database, but several migrations
alter the **attached user** database (`user.decks`, `user.deck_cards`, …).
`scripts/migrate.ts` runs inside a refresh against the WORK COPY: a copy of the
cards DB *and* a copy of the user DB. So such a migration applies its ALTER to
a file that is then thrown away, while its version stamp rides into production
on the cards DB that gets swapped in. The live user DB never gets the change,
and the version gate skips it forever.

That happened with migration 35 (`decks.version`) — the app then threw
"no such column: version" against a database whose schema version said it was
current. 36 re-issues it. When you hit this: **add a new migration id** with a
`hasColumn` guard rather than editing the old one, since already-correct
databases must no-op.

### ⚠️ Two processes must not write one SQLite file across a Docker bind mount

SQLite coordinates multi-process access with POSIX advisory (`fcntl`) locks,
and **those locks do NOT propagate across a macOS↔VM bind mount**. A host
process (a scraper, `sqlite3`, a migration) writing a WAL-mode database that a
container also has open gives the two connections inconsistent WAL/shm views,
and the container starts throwing `SQLITE_CORRUPT: database disk image is
malformed` — while `PRAGMA integrity_check` on the file still says `ok`.
(Happened 2026-07-24 while back-filling promo cards; recovered by stopping the
container + `wal_checkpoint`, no data lost — but don't rely on that.)

This is why the deployment is a Linux host with a local disk, where locking
works as designed and the daemon writes the live file directly. It still
matters here: if you ever run a container against `data.nosync/` on this Mac,
stop it before touching those files from the shell, and
`PRAGMA wal_checkpoint(TRUNCATE);` afterwards.

On the NAS the equivalent rule is simpler — **don't reach into the dataset from
the TrueNAS shell while the container is up.** Use the app, or stop the
container first.

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

## 界面文案

界面语言是中文,写法按产品文案,不按说话:

- 数量为 0 就写 `0 张`,不要换成「还没有」。同一个字段在任何取值下保持同一种措辞和
  格式 —— 在低值处换说法,读起来像换了一个字段,而不是同一个字段的另一个值。
- 空状态统一「暂无…」(暂无卡组 / 暂无 Passkey / 暂无记录),不写「还没有…吧」。
- 完成态只陈述事实(「已全部备齐」),不用感叹号、不用 🎉 之类的庆祝语。
- 术语一处定下就全站一致(备齐、已收集、暂无),不要同义词轮换。
- 表情符号只当图标用(📦 已收集、🔍 检索),不当情绪用。
- 能用控件本身表达的就不写说明文字:用 placeholder、禁用态、勾选态说话,
  实现细节和设计意图写进注释和 commit message,不写在页面上。

改文案时注意 e2e 里可能断言的是那句话本身,一并改。

### Manual Docker operations on the NAS (rarely needed — CI does this)

Run these in the TrueNAS shell, from the directory holding
`docker-compose.nas.yml` and its `.env`:

- Take a new image now: `docker compose -f docker-compose.nas.yml pull && docker compose -f docker-compose.nas.yml up -d`
- Apply a compose CHANGE (mounts, `user:`, `TZ`, `init`): the same command.
  Watchtower alone will not — it reuses the running container's configuration.
- Logs: `docker compose -f docker-compose.nas.yml logs -f` (the entrypoint, both
  daemons and Litestream all log to stdout).
- One-off refresh: `docker exec card-deck-builder node /app/scripts-dist/refresh-daemon.js --once cards sets`
- Verify a restore: `docker exec card-deck-builder node /app/scripts-dist/backup-daemon.js --verify`
