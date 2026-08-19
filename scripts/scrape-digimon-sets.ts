/**
 * The official product list, in release order.
 *
 * digimoncard.com's card-list page carries a 収録弾 (pack) dropdown that is
 * the authoritative list of products, ordered newest first. Nothing else we
 * scrape says which pack is newer: card codes only sort within a series
 * (BT25 < BT26, but BT-25 → AD-01 → EX-11 → BT-24 is the real order), and
 * `imported_at` collapses to one timestamp for everything that arrived in the
 * first bulk import.
 *
 * Rows land in `card_sets`, keyed by the code the dropdown prints in 【】:
 *
 *   ブースターパック TIMELESS BONDS【BT-26】 → BT-26
 *
 * which is the same code our English `set_names` carry in [square brackets],
 * so the two join without a lookup table.
 *
 *   npx tsx scripts/scrape-digimon-sets.ts [--dry-run]
 */

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);
const LIST_URL = "https://digimoncard.com/cards/?search=true&category=503040";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type ScrapedSet = {
  code: string;
  category: string;
  name_ja: string;
  /** Bigger = newer. */
  release_order: number;
};

/**
 * Pull the pack list out of the page.
 *
 * Options without a 【code】 — プロモーションカード, 公式大会景品 and the other
 * four merch/prize buckets — are skipped rather than invented for: they aren't
 * releases, they have no position in time, and a deck whose newest card is a
 * promo should fall back to the newest REAL pack it contains.
 */
export function parseSetOptions(html: string): ScrapedSet[] {
  // [\s\S] rather than the `s` flag: tsconfig targets ES2017 here.
  const block = html.match(/<select name="category"[\s\S]*?<\/select>/);
  if (!block) return [];
  const opts = [
    ...block[0].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g),
  ];
  const rows: Omit<ScrapedSet, "release_order">[] = [];
  for (const [, value, rawLabel] of opts) {
    const label = rawLabel
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!value || !label) continue;
    const code = label.match(/【([^】]+)】/)?.[1]?.trim();
    if (!code) continue;
    rows.push({ code, category: value, name_ja: label });
  }
  // The dropdown is newest-first; invert so bigger = newer.
  return rows.map((r, i) => ({ ...r, release_order: rows.length - i }));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const res = await fetch(LIST_URL, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`GET card list failed: ${res.status}`);
  const sets = parseSetOptions(await res.text());

  // A parse that finds almost nothing means the page changed shape. Writing
  // that would leave every deck's version unorderable, so refuse — same rule
  // the card scrapers use (see lib/scraper/sanity).
  if (sets.length < 50) {
    console.error(
      `[sets] only ${sets.length} packs parsed — the dropdown must have changed. Refusing to write.`,
    );
    process.exit(1);
  }

  console.log(`[sets] ${sets.length} packs, newest: ${sets[0].code} ${sets[0].name_ja}`);
  if (dryRun) {
    for (const s of sets.slice(0, 5)) console.log(`  ${s.release_order} ${s.code} ${s.name_ja}`);
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  const upsert = db.prepare(
    `INSERT INTO card_sets (code, category, name_ja, release_order)
     VALUES (@code, @category, @name_ja, @release_order)
     ON CONFLICT(code) DO UPDATE SET
       category = excluded.category,
       name_ja = excluded.name_ja,
       release_order = excluded.release_order`,
  );
  db.transaction(() => {
    for (const s of sets) upsert.run(s);
  })();
  const n = db.prepare("SELECT COUNT(*) n FROM card_sets").get() as { n: number };
  console.log(`[sets] done. ${n.n} rows in card_sets`);
  db.close();
}

if (require.main === module) main();
