/**
 * Scrape full card metadata from the official Digimon cardlist.
 *
 * Strategy:
 *   - The official site has a POST endpoint that returns full server-rendered
 *     HTML with embedded card data:
 *       POST https://world.digimoncard.com/cards/index.php?search=true
 *       body: free=<query>
 *   - Querying by set prefix (e.g. "BT25") returns up to ~150 cards per call.
 *   - We parse each card's popup block with cheerio and UPSERT into our DB.
 *
 * By default scrapes ALL set prefixes present in the DB. Use `--only=BT25` to
 * target one set, or `--missing` to only re-scrape rows where name is empty.
 *
 * Pure parsing logic lives in `src/lib/scraper/digimon.ts`; this file is the
 * fetch + DB orchestration layer. Before each set's UPSERT we call
 * `checkScrapeSanity` so a silent selector regression aborts the run instead
 * of mass-overwriting good data with empty rows.
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-metadata.ts                    # all sets
 *   npx tsx scripts/scrape-digimon-metadata.ts --only=BT25
 *   npx tsx scripts/scrape-digimon-metadata.ts --missing
 *   npx tsx scripts/scrape-digimon-metadata.ts --force-on-warn    # ignore sanity warnings
 */

import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import {
  parseAll,
  type ScrapedCard,
} from "../src/lib/scraper/digimon";
import {
  checkScrapeSanity,
  formatSanityReport,
} from "../src/lib/scraper/sanity";

const DB_PATH = path.join(
  os.homedir(),
  "Desktop/workspace/digimon-deck-builder/data/digimon.db",
);
const SEARCH_URL = "https://world.digimoncard.com/cards/index.php?search=true";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function postSearch(query: string): Promise<string> {
  const body = new URLSearchParams({ free: query });
  const r = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`POST ${query} failed: ${r.status}`);
  return await r.text();
}

async function main() {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg?.split("=")[1];
  const missingOnly = args.includes("--missing");

  const db = new Database(DB_PATH);

  let prefixes: string[];
  if (only) {
    prefixes = [only];
  } else if (missingOnly) {
    prefixes = (
      db
        .prepare(
          `SELECT DISTINCT substr(code, 1, instr(code, '-') - 1) AS pfx
           FROM cards WHERE name = '' AND code LIKE '%-%' ORDER BY pfx`,
        )
        .all() as { pfx: string }[]
    )
      .map((r) => r.pfx)
      .filter(Boolean);
  } else {
    prefixes = (
      db
        .prepare(
          `SELECT DISTINCT substr(code, 1, instr(code, '-') - 1) AS pfx
           FROM cards WHERE code LIKE '%-%' ORDER BY pfx`,
        )
        .all() as { pfx: string }[]
    )
      .map((r) => r.pfx)
      .filter(Boolean);
  }

  console.log(`Scraping metadata for ${prefixes.length} set prefixes:`, prefixes.join(", "));

  // Get codes we care about (for --missing, only those without name)
  let needCodes: Set<string> | null = null;
  if (missingOnly) {
    needCodes = new Set(
      (db.prepare("SELECT code FROM cards WHERE name = ''").all() as { code: string }[]).map(
        (r) => r.code,
      ),
    );
    console.log(`  filtering to ${needCodes.size} empty-name codes only.`);
  }

  // Scraper is authoritative — overwrite fields with scraped values.
  // UPSERT so that newly discovered cards (not yet in our DB) are inserted too.
  const upsert = db.prepare(
    `INSERT INTO cards (
       id, code, name, rarity, card_type, level, color, color2,
       play_cost, dp, attribute, form, stage, digi_types,
       evolution_cost, evolution_requirements,
       main_effect, security_effect, inherited_effect, source_effect,
       set_names, image_url
     ) VALUES (
       @code, @code, @name, @rarity, @card_type, @level, @color, @color2,
       @play_cost, @dp, @attribute, @form, @stage, @digi_types,
       @evolution_cost, @evolution_requirements,
       @main_effect, @security_effect, @inherited_effect, @source_effect,
       @set_names, @image_url
     )
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       rarity = excluded.rarity,
       card_type = excluded.card_type,
       level = excluded.level,
       color = excluded.color,
       color2 = excluded.color2,
       play_cost = excluded.play_cost,
       dp = excluded.dp,
       attribute = excluded.attribute,
       form = excluded.form,
       stage = excluded.stage,
       digi_types = excluded.digi_types,
       evolution_cost = excluded.evolution_cost,
       evolution_requirements = excluded.evolution_requirements,
       main_effect = excluded.main_effect,
       security_effect = excluded.security_effect,
       inherited_effect = excluded.inherited_effect,
       source_effect = excluded.source_effect,
       set_names = excluded.set_names,
       image_url = excluded.image_url`,
  );
  // Track which codes already exist so we can report inserts vs updates accurately.
  const existingCodes = new Set(
    (db.prepare("SELECT code FROM cards").all() as { code: string }[]).map(
      (r) => r.code,
    ),
  );
  const upsertMany = db.transaction((rows: ScrapedCard[]) => {
    let inserted = 0;
    let updated = 0;
    for (const r of rows) {
      const wasExisting = existingCodes.has(r.code);
      upsert.run(r as unknown as Record<string, unknown>);
      if (wasExisting) updated++;
      else {
        inserted++;
        existingCodes.add(r.code);
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
      // Search with a trailing hyphen so prefixes like "BT1" don't also match BT10..BT19
      const html = await postSearch(`${pfx}-`);
      let cards = parseAll(html);
      cards = cards.filter((c) => c.code.startsWith(pfx + "-"));
      if (needCodes) cards = cards.filter((c) => needCodes!.has(c.code));

      // Sanity-check the batch before touching the DB. Abort if structural
      // health is below thresholds (e.g. selectors changed and 100% of names
      // are empty) — better to fail loudly than silently nuke real data.
      const report = checkScrapeSanity(cards);
      if (!report.ok) {
        process.stdout.write("SANITY FAILED — refusing to write\n");
        console.error(formatSanityReport(report));
        throw new Error(
          `sanity check failed for set ${pfx}; aborting before any DB writes`,
        );
      }
      if (report.issues.length > 0) {
        process.stdout.write("\n");
        console.warn(formatSanityReport(report));
      }

      const { inserted, updated } = upsertMany(cards);
      totalInserted += inserted;
      totalUpdated += updated;
      process.stdout.write(
        `${inserted + updated} cards (inserted=${inserted}, updated=${updated})\n`,
      );
    } catch (e) {
      process.stdout.write(`ERROR: ${(e as Error).message}\n`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(
    `\nTotal: inserted=${totalInserted}, updated=${totalUpdated} in ${elapsed.toFixed(0)}s.`,
  );

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
