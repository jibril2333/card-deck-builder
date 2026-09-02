/**
 * Scrape Digimon card prices from PAO (pao-onlineshop.com) into
 * `external_prices` under the source name "pao".
 *
 * A second shop, not a replacement: `external_prices` has been keyed by
 * (source, card_id, variant_type) since it was written, and two quotes for the
 * same card are worth more than one — Cardrush and PAO disagree often enough
 * that the pair is the useful thing.
 *
 * One request per card code, throttled, and skipping anything priced in the
 * last `--max-age` hours (default 72) so a daily run costs almost nothing.
 *
 * Usage:
 *   npx tsx scripts/scrape-pao-prices.ts --only=BT1-084
 *   npx tsx scripts/scrape-pao-prices.ts --limit=50 --dry-run
 *   npx tsx scripts/scrape-pao-prices.ts            # everything, aged out
 */

import Database from "better-sqlite3";
import { GAMES } from "../src/lib/games";
import { parsePaoSearchPage } from "../src/lib/scraper/pao";
import { shopSearchUrl } from "../src/lib/shops";
import { reportProgress } from "../src/lib/refresh-progress";

const UA_HEADER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DELAY_MS = 700;
const SOURCE = "pao";

function parseArgs() {
  const args = process.argv.slice(2);
  const pick = (flag: string): string | null => {
    for (const a of args) {
      if (a === flag) return "";
      if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
    }
    return null;
  };
  return {
    only: pick("--only") || null,
    limit: Number(pick("--limit") ?? 0),
    dryRun: args.includes("--dry-run"),
    maxAgeHours: args.includes("--force") ? 0 : Number(pick("--max-age") ?? 72),
  };
}

async function fetchSearch(code: string): Promise<string> {
  const url = shopSearchUrl("pao", code);
  const r = await fetch(url, {
    headers: {
      "user-agent": UA_HEADER,
      "accept-language": "ja-JP,ja;q=0.9,en;q=0.5",
    },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return await r.text();
}

async function main() {
  const args = parseArgs();
  const db = new Database(GAMES.digimon.dbPath);
  console.log(`Cards DB: ${GAMES.digimon.dbPath}`);
  // This can run against a database the app has never opened, so the column
  // it writes has to be ensured here too (migration 41 does it for the app).
  const hasItemCode = (
    db.prepare("PRAGMA table_info(external_prices)").all() as { name: string }[]
  ).some((c) => c.name === "item_code");
  if (!hasItemCode) {
    db.exec("ALTER TABLE external_prices ADD COLUMN item_code TEXT");
  }

  let codes = args.only
    ? [args.only]
    : (
        db
          .prepare(
            `SELECT DISTINCT code FROM cards WHERE code LIKE '%-%' ORDER BY code`,
          )
          .all() as { code: string }[]
      ).map((r) => r.code);

  if (args.maxAgeHours > 0 && !args.only) {
    const fresh = new Set(
      (
        db
          .prepare(
            // Fresh AND complete. A row scraped before item_code existed has
            // a price but no product id, which is a row the cart script can't
            // use — so it is not "already done" and must be fetched again.
            `SELECT c.code FROM cards c
               JOIN external_prices p ON p.card_id = c.id
              WHERE p.source = ? AND p.fetched_at > datetime('now', ?)
                AND p.item_code IS NOT NULL
              GROUP BY c.code`,
          )
          .all(SOURCE, `-${args.maxAgeHours} hours`) as { code: string }[]
      ).map((r) => r.code),
    );
    const before = codes.length;
    codes = codes.filter((c) => !fresh.has(c));
    if (before !== codes.length) {
      console.log(
        `Skipping ${before - codes.length} card(s) priced within ${args.maxAgeHours}h ` +
          `(--force, or --max-age=0, to re-check everything)`,
      );
    }
  }
  if (args.limit > 0) codes = codes.slice(0, args.limit);
  console.log(`Scope: ${codes.length} code(s)\n`);

  const idByCode = new Map(
    (db.prepare(`SELECT code, id FROM cards`).all() as {
      code: string;
      id: string;
    }[]).map((r) => [r.code, r.id]),
  );

  const upsert = db.prepare(
    `INSERT INTO external_prices
       (source, card_id, variant_type, price_yen, in_stock, item_code, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(source, card_id, variant_type) DO UPDATE SET
       price_yen = excluded.price_yen,
       in_stock = excluded.in_stock,
       item_code = excluded.item_code,
       fetched_at = excluded.fetched_at`,
  );

  let priced = 0;
  let none = 0;
  let errored = 0;
  // The admin panel reads this while the run is in flight — see
  // lib/refresh-progress. Written before the first request so the bar
  // appears immediately rather than after the first card.
  reportProgress({ script: "scrape-pao-prices", done: 0, total: codes.length }, true);
  for (const [i, code] of codes.entries()) {
    process.stdout.write(`  ${code}: `);
    reportProgress({
      script: "scrape-pao-prices",
      done: i,
      total: codes.length,
      note: code,
    });
    try {
      const summary = parsePaoSearchPage(await fetchSearch(code), code);
      const cardId = idByCode.get(code);
      if (!cardId) {
        process.stdout.write("(no matching card_id in DB)\n");
        errored++;
      } else if (summary.total_listings === 0) {
        // PAO simply doesn't stock every card; that is not an error.
        process.stdout.write("(not stocked)\n");
        none++;
      } else {
        if (!args.dryRun) {
          if (summary.base_price != null) {
            upsert.run(
              SOURCE,
              cardId,
              "base",
              summary.base_price,
              summary.base_in_stock ? 1 : 0,
              summary.base_item_code,
            );
          }
          if (summary.parallel_price != null) {
            upsert.run(
              SOURCE,
              cardId,
              "parallel",
              summary.parallel_price,
              summary.parallel_in_stock ? 1 : 0,
              summary.parallel_item_code,
            );
          }
        }
        const fmt = (p: number | null, s: boolean | null) =>
          p == null ? "—" : `¥${p.toLocaleString()}${s ? "" : " (sold out)"}`;
        process.stdout.write(
          `${summary.total_listings} listings  base=${fmt(summary.base_price, summary.base_in_stock)}  ` +
            `parallel=${fmt(summary.parallel_price, summary.parallel_in_stock)}\n`,
        );
        priced++;
      }
    } catch (e) {
      process.stdout.write(`ERROR ${(e as Error).message}\n`);
      errored++;
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(
    `\nDone — priced=${priced}, not-stocked=${none}, error=${errored}` +
      (args.dryRun ? " (dry run, nothing written)" : ""),
  );
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
