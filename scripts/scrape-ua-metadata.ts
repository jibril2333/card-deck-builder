/**
 * Scrape full card metadata from the official UNION ARENA Japanese cardlist.
 *
 * Two-step flow per set:
 *   1. POST  /jp/cardlist/index.php?search=true  body: `freewords=<prefix>`
 *      → list of `{ code, name, image_url }` for every printing in that set.
 *   2. GET   /jp/cardlist/detail_iframe.php?card_no=<code>
 *      → all detail fields (name reading, rarity, type, cost, BP, effect, …).
 *
 * Sanity-checks the whole batch before any UPSERT so a selector regression
 * abort instead of nuking good DB rows with blanks.
 *
 * Run with:
 *   npx tsx scripts/scrape-ua-metadata.ts                 # all set prefixes in DB
 *   npx tsx scripts/scrape-ua-metadata.ts --only=EX01BT   # one set
 *   npx tsx scripts/scrape-ua-metadata.ts --new=UA30BT    # new set not yet in DB
 *   npx tsx scripts/scrape-ua-metadata.ts --missing       # blank-name rows only
 */

import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import {
  parseDetailPage,
  parseListPage,
  uaCardId,
  type ScrapedUACard,
} from "../src/lib/scraper/ua";
import { checkUASanity, formatUASanityReport } from "../src/lib/scraper/sanity-ua";

const DB_PATH = path.join(
  os.homedir(),
  "Desktop/workspace/unionarena-deck-builder/data/unionarena.db",
);
const BASE_URL = "https://www.unionarena-tcg.com";
const SEARCH_URL = `${BASE_URL}/jp/cardlist/index.php?search=true`;
const IFRAME_URL = `${BASE_URL}/jp/cardlist/detail_iframe.php`;
const UA_HEADER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SET_DELAY_MS = 500;
const DETAIL_DELAY_MS = 300;

async function postSearch(prefix: string): Promise<string> {
  const body = new URLSearchParams({ freewords: prefix });
  const r = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "user-agent": UA_HEADER,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`search ${prefix} → ${r.status}`);
  return await r.text();
}

async function fetchDetail(code: string): Promise<string> {
  const url = `${IFRAME_URL}?card_no=${encodeURIComponent(code)}`;
  const r = await fetch(url, {
    headers: { "user-agent": UA_HEADER },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`detail ${code} → ${r.status}`);
  return await r.text();
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="))?.split("=")[1];
  const newArg = args.find((a) => a.startsWith("--new="))?.split("=")[1];
  const missingOnly = args.includes("--missing");

  const db = new Database(DB_PATH);

  let prefixes: string[];
  if (onlyArg) {
    prefixes = [onlyArg];
  } else if (newArg) {
    prefixes = [newArg];
  } else if (missingOnly) {
    prefixes = (
      db
        .prepare(
          `SELECT DISTINCT substr(code, 1, instr(code, '/') - 1) AS pfx
           FROM cards WHERE name = '' AND code LIKE '%/%' ORDER BY pfx`,
        )
        .all() as { pfx: string }[]
    )
      .map((r) => r.pfx)
      .filter(Boolean);
  } else {
    prefixes = (
      db
        .prepare(
          `SELECT DISTINCT substr(code, 1, instr(code, '/') - 1) AS pfx
           FROM cards WHERE code LIKE '%/%' ORDER BY pfx`,
        )
        .all() as { pfx: string }[]
    )
      .map((r) => r.pfx)
      .filter(Boolean);
  }

  console.log(
    `Scraping ${prefixes.length} set prefix${prefixes.length === 1 ? "" : "es"}:`,
    prefixes.join(", "),
  );

  let needCodes: Set<string> | null = null;
  if (missingOnly) {
    needCodes = new Set(
      (
        db.prepare("SELECT code FROM cards WHERE name = ''").all() as {
          code: string;
        }[]
      ).map((r) => r.code),
    );
    console.log(`  filtering to ${needCodes.size} blank-name codes only.`);
  }

  // Scraper is authoritative for these fields.
  const upsert = db.prepare(
    `INSERT INTO cards (
       id, code, name, name_reading, series, color, rarity, card_type,
       energy_cost, ap_cost, bp, trigger_text, effect_text,
       image_url, source_url, locale, source
     ) VALUES (
       @id, @code, @name, @name_reading, @series, @color, @rarity, @card_type,
       @energy_cost, @ap_cost, @bp, @trigger_text, @effect_text,
       @image_url, @source_url, 'jp', 'official-jp'
     )
     ON CONFLICT(id) DO UPDATE SET
       code         = excluded.code,
       name         = excluded.name,
       name_reading = excluded.name_reading,
       series       = excluded.series,
       color        = excluded.color,
       rarity       = excluded.rarity,
       card_type    = excluded.card_type,
       energy_cost  = excluded.energy_cost,
       ap_cost      = excluded.ap_cost,
       bp           = excluded.bp,
       trigger_text = excluded.trigger_text,
       effect_text  = excluded.effect_text,
       image_url    = excluded.image_url,
       source_url   = excluded.source_url`,
  );
  const existingCodes = new Set(
    (db.prepare("SELECT code FROM cards").all() as { code: string }[]).map(
      (r) => r.code,
    ),
  );
  const upsertMany = db.transaction((rows: ScrapedUACard[]) => {
    let inserted = 0;
    let updated = 0;
    for (const c of rows) {
      const wasExisting = existingCodes.has(c.code);
      upsert.run({ ...c, id: uaCardId(c.code) } as unknown as Record<
        string,
        unknown
      >);
      if (wasExisting) updated++;
      else {
        inserted++;
        existingCodes.add(c.code);
      }
    }
    return { inserted, updated };
  });

  let totalInserted = 0;
  let totalUpdated = 0;
  const startedAt = Date.now();

  for (const pfx of prefixes) {
    process.stdout.write(`  ${pfx}: `);
    try {
      const listHtml = await postSearch(pfx);
      let entries = parseListPage(listHtml).filter((e) =>
        e.code.startsWith(`${pfx}/`),
      );
      if (needCodes) {
        entries = entries.filter((e) => needCodes!.has(e.code));
      }
      if (entries.length === 0) {
        process.stdout.write("(nothing to scrape)\n");
        continue;
      }
      process.stdout.write(`${entries.length} entries… `);

      // Fetch each detail page.
      const detailed: ScrapedUACard[] = [];
      let failedCount = 0;
      for (const e of entries) {
        try {
          const html = await fetchDetail(e.code);
          const card = parseDetailPage(html, e.code);
          if (card) {
            // The list-row image is authoritative for alt-art (since detail
            // strips the suffix); but verify our parser came up with the same
            // — fall back to list image_url if parser somehow returned empty.
            if (!card.image_url) card.image_url = e.image_url;
            detailed.push(card);
          } else {
            failedCount++;
          }
        } catch (err) {
          failedCount++;
          console.error(`\n    ${e.code}: ${(err as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, DETAIL_DELAY_MS));
      }

      const report = checkUASanity(detailed);
      if (!report.ok) {
        process.stdout.write("SANITY FAILED — refusing to write\n");
        console.error(formatUASanityReport(report));
        throw new Error(`sanity check failed for set ${pfx}; aborting writes`);
      }
      if (report.issues.length > 0) {
        process.stdout.write("\n");
        console.warn(formatUASanityReport(report));
      }

      const { inserted, updated } = upsertMany(detailed);
      totalInserted += inserted;
      totalUpdated += updated;
      process.stdout.write(
        `${inserted + updated} cards (inserted=${inserted}, updated=${updated}${
          failedCount ? `, failed=${failedCount}` : ""
        })\n`,
      );
    } catch (e) {
      process.stdout.write(`ERROR: ${(e as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, SET_DELAY_MS));
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(
    `\nTotal: inserted=${totalInserted}, updated=${totalUpdated} in ${elapsed.toFixed(
      0,
    )}s.`,
  );

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
