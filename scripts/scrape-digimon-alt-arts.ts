/**
 * Probe official Digimon cardlist for alt-art variants.
 *
 * For each card code we already have in the DB, try `_P1`, `_P2`, ... suffixes
 * against the official image CDN. Stop probing when we hit a 404 (parallels are
 * sequential — if _P2 is missing, _P3+ won't exist).
 *
 * Populates the `card_images` table with one row per (code, variant).
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-alt-arts.ts
 */

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(
  process.cwd(),
  "data.nosync",
  "digimon.db",
);
const BASE_URL = "https://world.digimoncard.com/images/cardlist/card";
const MAX_PARALLEL_VARIANTS = 5; // probe _P1.._P5
const HTTP_CONCURRENCY = 16;
const USER_AGENT = "card-deck-builder/0.1 (alt-art-scraper)";

type Variant = { code: string; variant: string; image_url: string };

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_images (
      code TEXT NOT NULL,
      variant TEXT NOT NULL,
      image_url TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (code, variant)
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_card_images_code ON card_images(code)",
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
async function probeCard(code: string): Promise<Variant[]> {
  const baseUrl = `${BASE_URL}/${code}.png`;
  const baseStatus = await head(baseUrl);
  if (baseStatus !== 200) return [];

  const out: Variant[] = [{ code, variant: "", image_url: baseUrl }];
  for (let i = 1; i <= MAX_PARALLEL_VARIANTS; i++) {
    const variant = `_P${i}`;
    const url = `${BASE_URL}/${code}${variant}.png`;
    const s = await head(url);
    if (s !== 200) break;
    out.push({ code, variant, image_url: url });
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

async function main() {
  const db = new Database(DB_PATH);
  ensureSchema(db);

  const codes = (
    db
      .prepare("SELECT code FROM cards WHERE code IS NOT NULL ORDER BY code")
      .all() as { code: string }[]
  ).map((r) => r.code);

  console.log(`Scraping ${codes.length} cards with concurrency=${HTTP_CONCURRENCY}…`);

  const insert = db.prepare(
    `INSERT INTO card_images (code, variant, image_url) VALUES (?, ?, ?)
     ON CONFLICT(code, variant) DO UPDATE SET
       image_url = excluded.image_url,
       checked_at = CURRENT_TIMESTAMP`,
  );
  const insertMany = db.transaction((rows: Variant[]) => {
    for (const r of rows) insert.run(r.code, r.variant, r.image_url);
  });

  let totalVariants = 0;
  let cardsWithAltArt = 0;
  let baseHit = 0;
  let baseMiss = 0;
  const startedAt = Date.now();

  await pool(codes, HTTP_CONCURRENCY, async (code) => {
    const variants = await probeCard(code);
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
      `SELECT code, COUNT(*) as n FROM card_images GROUP BY code HAVING n > 1 ORDER BY n DESC, code LIMIT 10`,
    )
    .all() as { code: string; n: number }[];
  if (samples.length) {
    console.log("\nTop cards by variant count:");
    for (const s of samples) console.log(`  ${s.code}: ${s.n} images`);
  }

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
