/**
 * Scrape official card Q&A (カードQ&A) from the JP Digimon cardlist into
 * `card_rulings` (lang='ja'). The JP site embeds Q&A inline in each card's
 * popup; the EN site has none and the CN site exposes no rulings API, so JP
 * is the authoritative source.
 *
 * Fetches per set prefix (same query as the JP text scraper) and per-code for
 * stragglers. Only cards that actually have rulings get rows.
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-rulings.ts            # all set prefixes
 *   npx tsx scripts/scrape-digimon-rulings.ts --only=BT25
 */

import Database from "better-sqlite3";
import path from "node:path";
import { parseRulingsAll } from "../src/lib/scraper/digimon";
import { CARD_RULINGS_DDL, UPSERT_RULING_SQL } from "../src/lib/db/rulings-ddl";
import { reportProgress } from "../src/lib/refresh-progress";

// CDB_DATA_DIR lets a long run write a COPY of the DB while the prod container
// keeps serving the real one (host writes to the bind-mounted DB corrupt the
// container's view — see AGENTS.md).
const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);
const SEARCH_URL = "https://digimoncard.com/cards/index.php?search=true";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SET_DELAY_MS = 600;

async function postSearch(query: string): Promise<string> {
  const r = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ free: query }).toString(),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`POST ${query} failed: ${r.status}`);
  return await r.text();
}

async function main() {
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CARD_RULINGS_DDL);
  const upsert = db.prepare(UPSERT_RULING_SQL);

  const prefixes = only
    ? [only]
    : (
        db
          .prepare(
            `SELECT DISTINCT substr(code, 1, instr(code, '-') - 1) AS p
             FROM cards WHERE instr(code, '-') > 0 ORDER BY p`,
          )
          .all() as { p: string }[]
      ).map((r) => r.p);

  console.log(`[rulings] ${prefixes.length} set prefixes`);

  let total = 0;
  let cardsWithRulings = 0;
  reportProgress(
    { script: "scrape-digimon-rulings", done: 0, total: prefixes.length },
    true,
  );
  for (const [pi, prefix] of prefixes.entries()) {
    reportProgress({
      script: "scrape-digimon-rulings",
      done: pi,
      total: prefixes.length,
      note: prefix,
    },
      true,
    );
    let rulings;
    try {
      rulings = parseRulingsAll(await postSearch(`${prefix}-`));
    } catch (e) {
      console.error(`[rulings] ${prefix}: fetch/parse failed`, e);
      continue;
    }
    const exact = rulings.filter((r) => r.code.startsWith(`${prefix}-`));
    const codes = new Set<string>();
    const tx = db.transaction(() => {
      for (const r of exact) {
        upsert.run({
          code: r.code,
          q_number: r.q_number,
          lang: "ja",
          date: r.date || null,
          question: r.question,
          answer: r.answer,
        });
        codes.add(r.code);
      }
    });
    tx();
    total += exact.length;
    cardsWithRulings += codes.size;
    if (exact.length) {
      console.log(`[rulings] ${prefix}: ${exact.length} Q&A on ${codes.size} cards`);
    }
    await new Promise((r) => setTimeout(r, SET_DELAY_MS));
  }

  console.log(
    `[rulings] done. ${total} Q&A entries across ${cardsWithRulings} cards`,
  );
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
