/**
 * Probe the official Digimon cardlists for alt-art variants, PER LANGUAGE.
 *
 * For each card code we already have in the DB, try `_P1`, `_P2`, ... suffixes
 * against the official image CDN. Stop probing when we hit a 404 (parallels are
 * sequential — if _P2 is missing, _P3+ won't exist).
 *
 * Both the EN and JP cardlists expose the same `<code>_P<n>.png` layout, just on
 * different hosts, so one prober serves both. (Chinese art is NOT probeable —
 * its filenames carry an opaque numeric id, so zh variants come from the CN
 * API instead; see scrape-digimon-cn.ts.)
 *
 * Populates `card_images` with one row per (code, lang, variant).
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-alt-arts.ts                  # en + ja, all cards
 *   npx tsx scripts/scrape-digimon-alt-arts.ts --lang=ja        # one language
 *   npx tsx scripts/scrape-digimon-alt-arts.ts --only=EX12      # one set prefix
 *   npx tsx scripts/scrape-digimon-alt-arts.ts --missing-only   # skip already-probed
 */

import Database from "better-sqlite3";
import path from "node:path";
import { reportProgress } from "../src/lib/refresh-progress";

// Honour CDB_DATA_DIR so a long probe can run against a COPY of the DB while
// the prod container keeps serving the real one (writing the bind-mounted DB
// from the host while the container has it open corrupts its view — see
// AGENTS.md).
const DATA_BASE =
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync");
const DB_PATH = path.join(DATA_BASE, "digimon.db");

/** Per-language image CDNs. Both use the same `<code><variant>.png` layout. */
const SOURCES: Record<string, string> = {
  en: "https://world.digimoncard.com/images/cardlist/card",
  ja: "https://digimoncard.com/images/cardlist/card",
};
// Was 5, which silently truncated the handful of cards that have more prints
// than that (46 cards sat exactly at _P5 with no way to tell if _P6 existed).
const MAX_PARALLEL_VARIANTS = 15;
const HTTP_CONCURRENCY = 16;
const USER_AGENT = "card-deck-builder/0.1 (alt-art-scraper)";

type Variant = {
  code: string;
  lang: string;
  variant: string;
  image_url: string;
};

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_images (
      code TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en',
      variant TEXT NOT NULL,
      image_url TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (code, lang, variant)
    )
  `);
  // Pre-migration-19 DBs have the old (code, variant) table with no `lang`.
  // The app's own migration rebuilds it; do the same here so the script can
  // run standalone against a copy that hasn't been opened by the app yet.
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('card_images')")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "lang")) {
    db.exec(`
      CREATE TABLE card_images_new (
        code       TEXT NOT NULL,
        lang       TEXT NOT NULL DEFAULT 'en',
        variant    TEXT NOT NULL,
        image_url  TEXT NOT NULL,
        checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (code, lang, variant)
      );
      INSERT INTO card_images_new (code, lang, variant, image_url, checked_at)
        SELECT code, 'en', variant, image_url, checked_at FROM card_images;
      DROP TABLE card_images;
      ALTER TABLE card_images_new RENAME TO card_images;
    `);
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_card_images_code ON card_images(code)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_card_images_code_lang ON card_images(code, lang)",
  );
}

async function head(url: string, timeoutMs = 8000): Promise<number> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": USER_AGENT },
      signal: ac.signal,
    });
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

/**
 * For a single card code, returns the list of existing variants (incl. base).
 * Probes serially: base, _P1, _P2, ... stops at first 404 for parallel.
 */
async function probeCard(code: string, lang: string): Promise<Variant[]> {
  const base = SOURCES[lang];
  const baseUrl = `${base}/${code}.png`;
  const baseStatus = await head(baseUrl);
  if (baseStatus !== 200) return [];

  const out: Variant[] = [{ code, lang, variant: "", image_url: baseUrl }];
  for (let i = 1; i <= MAX_PARALLEL_VARIANTS; i++) {
    const variant = `_P${i}`;
    const url = `${base}/${code}${variant}.png`;
    const s = await head(url);
    if (s !== 200) break;
    out.push({ code, lang, variant, image_url: url });
  }
  return out;
}

/** Worker pool — runs `worker` over each item with bounded concurrency. */
async function pool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number, lastResult: R) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
        done++;
        onProgress?.(done, items.length, results[i]);
      }
    }),
  );
  return results;
}

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

function arg(flag: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : null;
}

async function main() {
  const db = new Database(DB_PATH);
  ensureSchema(db);

  const langArg = arg("--lang");
  const langs = langArg ? langArg.split(",") : Object.keys(SOURCES);
  for (const l of langs) {
    if (!SOURCES[l]) {
      console.error(`unknown --lang=${l} (known: ${Object.keys(SOURCES).join(",")})`);
      process.exit(1);
    }
  }
  const only = arg("--only");
  const missingOnly = process.argv.includes("--missing-only");

  const insert = db.prepare(
    `INSERT INTO card_images (code, lang, variant, image_url) VALUES (?, ?, ?, ?)
     ON CONFLICT(code, lang, variant) DO UPDATE SET
       image_url = excluded.image_url,
       checked_at = CURRENT_TIMESTAMP`,
  );
  const insertMany = db.transaction((rows: Variant[]) => {
    for (const r of rows) insert.run(r.code, r.lang, r.variant, r.image_url);
  });

  for (const lang of langs) {
    await runLang(db, lang, only, missingOnly, insertMany);
  }
  db.close();
}

async function runLang(
  db: Database.Database,
  lang: string,
  only: string | null,
  missingOnly: boolean,
  insertMany: (rows: Variant[]) => void,
) {
  const codes = (
    db
      .prepare(
        `SELECT code FROM cards
          WHERE code IS NOT NULL
            ${only ? "AND code LIKE @p" : ""}
            ${missingOnly ? "AND NOT EXISTS (SELECT 1 FROM card_images i WHERE i.code = cards.code AND i.lang = @lang)" : ""}
          ORDER BY code`,
      )
      .all({ p: `${only}-%`, lang }) as { code: string }[]
  ).map((r) => r.code);

  console.log(
    `\n[${lang}] ${codes.length} cards · concurrency=${HTTP_CONCURRENCY} · source=${SOURCES[lang]}`,
  );
  if (codes.length === 0) return;

  let totalVariants = 0;
  let cardsWithAltArt = 0;
  let baseHit = 0;
  let baseMiss = 0;
  const startedAt = Date.now();

  await pool(codes, HTTP_CONCURRENCY, async (code) => {
    const variants = await probeCard(code, lang);
    if (variants.length === 0) {
      baseMiss++;
      return { code, count: 0 };
    }
    baseHit++;
    insertMany(variants);
    totalVariants += variants.length;
    if (variants.length > 1) cardsWithAltArt++;
    return { code, count: variants.length };
  }, (done, total) => {
    reportProgress({
      script: "scrape-digimon-alt-arts",
      done,
      total,
      note: lang,
    });
    if (done % 200 === 0 || done === total) {
      const elapsed = Date.now() - startedAt;
      const rate = done / (elapsed / 1000);
      const remaining = (total - done) / rate;
      process.stdout.write(
        `\r  ${done}/${total} (${((done / total) * 100).toFixed(1)}%) ` +
        `· ${rate.toFixed(1)} req/s · base_hit=${baseHit} alt_arts=${cardsWithAltArt} total_imgs=${totalVariants} ` +
        `· ETA ${fmtElapsed(remaining * 1000)}    `,
      );
    }
  });

  process.stdout.write("\n");
  console.log(`Done in ${fmtElapsed(Date.now() - startedAt)}.`);
  console.log(`  base image found: ${baseHit}`);
  console.log(`  base image missing (404): ${baseMiss}`);
  console.log(`  cards with at least one alt art: ${cardsWithAltArt}`);
  console.log(`  total image variants inserted: ${totalVariants}`);

  // Print a few example multi-variant cards
  const samples = db
    .prepare(
      `SELECT code, COUNT(*) as n FROM card_images WHERE lang = ?
        GROUP BY code HAVING n > 1 ORDER BY n DESC, code LIMIT 10`,
    )
    .all(lang) as { code: string; n: number }[];
  if (samples.length) {
    console.log(`\n[${lang}] top cards by variant count:`);
    for (const s of samples) console.log(`  ${s.code}: ${s.n} images`);
  }

  // A card sitting exactly at the cap may have more prints we never probed.
  const capped = db
    .prepare(
      `SELECT COUNT(*) n FROM card_images WHERE lang = ? AND variant = ?`,
    )
    .get(lang, `_P${MAX_PARALLEL_VARIANTS}`) as { n: number };
  if (capped.n > 0) {
    console.log(
      `  ⚠ ${capped.n} card(s) hit the _P${MAX_PARALLEL_VARIANTS} cap — raise MAX_PARALLEL_VARIANTS and re-run.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
