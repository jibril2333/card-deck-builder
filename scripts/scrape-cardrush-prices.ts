/**
 * Scrape Digimon card prices from cardrush-digimon.jp and upsert them into
 * the `external_prices` table.
 *
 *   - Drives `https://www.cardrush-digimon.jp/product-list?keyword=<code>`,
 *     parses with `parseCardrushSearchPage`, takes cheapest mint-band base
 *     + parallel prices.
 *   - Throttled at ~700ms per request to avoid hammering them. A typical
 *     full run (~4 000 codes) takes ~45 min. Use `--my-collection` to scope
 *     to just what you own.
 *   - Cardrush doesn't currently sell UNION ARENA cards, so this script
 *     intentionally only runs against the digimon DB.
 *
 * Usage:
 *   # one card, see exactly what gets parsed
 *   npx tsx scripts/scrape-cardrush-prices.ts --only=BT1-084
 *
 *   # only the cards you actually own (reads card_collection)
 *   npx tsx scripts/scrape-cardrush-prices.ts --my-collection --email me@example.com
 *
 *   # everything in the cards DB
 *   npx tsx scripts/scrape-cardrush-prices.ts
 */

import Database from "better-sqlite3";
import { GAMES } from "../src/lib/games";
import { parseCardrushSearchPage } from "../src/lib/scraper/cardrush";
import { findUserByEmail } from "../src/lib/auth/repo";

const SEARCH_URL = "https://www.cardrush-digimon.jp/product-list";
const UA_HEADER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DELAY_MS = 700;

function parseArgs() {
  const args = process.argv.slice(2);
  function pick(flag: string): string | null {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === flag && i + 1 < args.length) return args[i + 1];
      if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
    }
    return null;
  }
  return {
    only: pick("--only"),
    email: pick("--email"),
    myCollection: args.includes("--my-collection"),
    dryRun: args.includes("--dry-run"),
  };
}

async function fetchSearch(code: string): Promise<string> {
  const url = `${SEARCH_URL}?keyword=${encodeURIComponent(code)}`;
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

function pickCodes(db: Database.Database, args: ReturnType<typeof parseArgs>) {
  if (args.only) return [args.only];
  if (args.myCollection) {
    // We need the user.id; user.email isn't in cards.db. We resolve it via
    // the auth repo, which reads digimon's user.db (where the users table
    // lives in this project).
    if (!args.email) {
      console.error("--my-collection requires --email <user-email>");
      process.exit(2);
    }
    // Use a separate connection via the app's getDB to do the auth lookup.
    // (We can't query users from `db` here — `db` only has the main cards
    // schema attached.) Returns the codes the user already owns.
    return null; // sentinel: handled separately
  }
  return (
    db
      .prepare(
        `SELECT DISTINCT code FROM cards WHERE code LIKE '%-%' ORDER BY code`,
      )
      .all() as { code: string }[]
  ).map((r) => r.code);
}

async function main() {
  const args = parseArgs();
  const dbPath = GAMES.digimon.dbPath;
  console.log(`Cards DB: ${dbPath}`);
  const db = new Database(dbPath);

  let codes: string[];
  if (args.myCollection) {
    if (!args.email) {
      console.error("--my-collection requires --email <user-email>");
      process.exit(2);
    }
    const user = await findUserByEmail(args.email);
    if (!user) {
      console.error(`No user for email ${args.email}`);
      process.exit(1);
    }
    // user.card_collection lives in digimon's user.db; we need to read it.
    // The script's `db` connection is to the main cards DB only, so open
    // the user.db separately.
    const userDb = new Database(GAMES.digimon.userDbPath, { readonly: true });
    try {
      codes = (
        userDb
          .prepare(
            `SELECT DISTINCT c.code FROM card_collection cc
             JOIN cards c ON c.id = cc.card_id
             WHERE cc.user_id = ?`,
          )
          .all(user.id) as { code: string }[]
      ).map((r) => r.code);
    } catch (_e) {
      // The user.db doesn't have a `cards` join — fall back to opening
      // the same connection the app uses (with cards ATTACHed).
      userDb.close();
      const { getDB } = await import("../src/lib/db/connection");
      const main = getDB("digimon");
      codes = (
        main
          .prepare(
            `SELECT DISTINCT c.code FROM user.card_collection cc
             JOIN cards c ON c.id = cc.card_id
             WHERE cc.user_id = ?`,
          )
          .all(user.id) as { code: string }[]
      ).map((r) => r.code);
    }
  } else {
    codes = pickCodes(db, args) as string[];
  }

  console.log(`Scope: ${codes.length} code(s)\n`);

  // Helper to lookup our card_id from the code.
  const idByCode = new Map<string, string>(
    (db.prepare(`SELECT code, id FROM cards`).all() as {
      code: string;
      id: string;
    }[]).map((r) => [r.code, r.id]),
  );

  const upsert = db.prepare(
    `INSERT INTO external_prices
       (source, card_id, variant_type, price_yen, in_stock, fetched_at)
     VALUES ('cardrush', ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(source, card_id, variant_type) DO UPDATE SET
       price_yen = excluded.price_yen,
       in_stock = excluded.in_stock,
       fetched_at = excluded.fetched_at`,
  );

  // Per-illustrator detail table: wipe + reinsert per card so removed
  // illust groups don't linger from a previous scrape.
  const wipeListings = db.prepare(
    `DELETE FROM external_listings WHERE source = 'cardrush' AND card_id = ?`,
  );
  const insertListing = db.prepare(
    `INSERT INTO external_listings
       (source, card_id, variant_type, illustrator, price_yen, in_stock, fetched_at)
     VALUES ('cardrush', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  );

  let success = 0;
  let zeroListings = 0;
  let errored = 0;
  const startedAt = Date.now();

  for (const code of codes) {
    process.stdout.write(`  ${code}: `);
    try {
      const html = await fetchSearch(code);
      const summary = parseCardrushSearchPage(html, code);
      if (summary.total_listings === 0) {
        process.stdout.write("(no listings)\n");
        zeroListings++;
      } else {
        const cardId = idByCode.get(code);
        if (!cardId) {
          process.stdout.write("(no matching card_id in DB)\n");
          errored++;
        } else {
          if (!args.dryRun) {
            if (summary.base_price != null) {
              upsert.run(
                cardId,
                "base",
                summary.base_price,
                summary.base_in_stock ? 1 : 0,
              );
            }
            if (summary.parallel_price != null) {
              upsert.run(
                cardId,
                "parallel",
                summary.parallel_price,
                summary.parallel_in_stock ? 1 : 0,
              );
            }
            // Per-illustrator detail rows.
            const txListings = db.transaction(() => {
              wipeListings.run(cardId);
              for (const p of summary.per_illust) {
                insertListing.run(
                  cardId,
                  p.variant_type,
                  p.illustrator,
                  p.price_yen,
                  p.in_stock ? 1 : 0,
                );
              }
            });
            txListings();
          }
          const baseStr =
            summary.base_price == null
              ? "—"
              : `¥${summary.base_price.toLocaleString()}${summary.base_in_stock ? "" : " (sold out)"}`;
          const parStr =
            summary.parallel_price == null
              ? "—"
              : `¥${summary.parallel_price.toLocaleString()}${summary.parallel_in_stock ? "" : " (sold out)"}`;
          process.stdout.write(
            `${summary.total_listings} listings  base=${baseStr}  parallel=${parStr}\n`,
          );
          success++;
        }
      }
    } catch (e) {
      process.stdout.write(`ERROR: ${(e as Error).message}\n`);
      errored++;
    }
    if (codes.length > 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(
    `\nDone in ${elapsed.toFixed(0)}s — success=${success}, ` +
      `no-listings=${zeroListings}, error=${errored}.` +
      (args.dryRun ? " (dry-run, nothing written)" : ""),
  );

  db.close();
}

main().catch((err) => {
  console.error("ERROR:", (err as Error).message);
  process.exit(1);
});
