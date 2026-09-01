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
import {
  parseAll,
  lastUnknownLabels,
  type ScrapedCard,
} from "../src/lib/scraper/digimon";
import {
  checkScrapeSanity,
  formatSanityReport,
} from "../src/lib/scraper/sanity";
import { reportProgress } from "../src/lib/refresh-progress";

// CDB_DATA_DIR lets a long run write a COPY of the DB while the prod container
// keeps serving the real one (host writes to the bind-mounted DB corrupt the
// container's view — see AGENTS.md).
const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
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

/** Report block labels the parser doesn't know — see lastUnknownLabels. */
function warnUnknownLabels(tag: string) {
  for (const [label, codes] of lastUnknownLabels) {
    console.warn(
      `[${tag}] UNKNOWN text block "${label}" on ${codes.join(", ")} — ` +
        `nothing maps to it, so its text is being dropped. Add it to LabelMap.`,
    );
  }
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
       set_names, image_url,
       dual_name, dual_color, dual_cost, dual_effect, dual_rule,
       link_dp, link_requirement, link_effect, special_rule
     ) VALUES (
       @code, @code, @name, @rarity, @card_type, @level, @color, @color2,
       @play_cost, @dp, @attribute, @form, @stage, @digi_types,
       @evolution_cost, @evolution_requirements,
       @main_effect, @security_effect, @inherited_effect, @source_effect,
       @set_names, @image_url,
       @dual_name, @dual_color, @dual_cost, @dual_effect, @dual_rule,
       @link_dp, @link_requirement, @link_effect, @special_rule
     )
     -- COALESCE(NULLIF(...)): a source that can't SEE a block must not erase
     -- what another source found — digimoncard.io has no [Special Play
     -- Condition], this site has no Link block for JP-only sets. A plain
     -- assignment let whichever ran last blank the other's rows, which cost 20
     -- cards their Link requirements on every single run.
  ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       rarity = excluded.rarity,
       card_type = excluded.card_type,
       level = excluded.level,
       color = excluded.color,
       color2 = excluded.color2,
       play_cost = excluded.play_cost,
       dp = excluded.dp,
       attribute = COALESCE(NULLIF(excluded.attribute, ''), attribute),
       form = COALESCE(NULLIF(excluded.form, ''), form),
       stage = COALESCE(NULLIF(excluded.stage, ''), stage),
       digi_types = COALESCE(NULLIF(excluded.digi_types, ''), digi_types),
       evolution_cost = COALESCE(NULLIF(excluded.evolution_cost, ''), evolution_cost),
       evolution_requirements = COALESCE(NULLIF(excluded.evolution_requirements, ''), evolution_requirements),
       main_effect = COALESCE(NULLIF(excluded.main_effect, ''), main_effect),
       security_effect = COALESCE(NULLIF(excluded.security_effect, ''), security_effect),
       inherited_effect = COALESCE(NULLIF(excluded.inherited_effect, ''), inherited_effect),
       source_effect = COALESCE(NULLIF(excluded.source_effect, ''), source_effect),
       set_names = COALESCE(NULLIF(excluded.set_names, ''), set_names),
       image_url = excluded.image_url,
       dual_name   = COALESCE(NULLIF(excluded.dual_name, ''), dual_name),
       dual_color  = COALESCE(NULLIF(excluded.dual_color, ''), dual_color),
       dual_cost   = COALESCE(excluded.dual_cost, dual_cost),
       dual_effect = COALESCE(NULLIF(excluded.dual_effect, ''), dual_effect),
       dual_rule   = COALESCE(NULLIF(excluded.dual_rule, ''), dual_rule),
       link_dp          = COALESCE(excluded.link_dp, link_dp),
       link_requirement = COALESCE(NULLIF(excluded.link_requirement, ''), link_requirement),
       link_effect      = COALESCE(NULLIF(excluded.link_effect, ''), link_effect),
       special_rule     = COALESCE(NULLIF(excluded.special_rule, ''), special_rule)`,
  );
  // Dual and Link cards are where the COALESCE guard actively preserves a WRONG
  // value. digimoncard.io has no concept of a second card face, and routes its
  // single "second block" by card type, so the text lands in whichever slot that
  // type implies:
  //   Digimon Dual/Link → inherited_effect, shown as 进化元效果
  //   Option  Link      → security_effect,  shown as 安全区效果
  // Both are wrong, and the guard — which exists so a source that CAN'T see a
  // block never erases it — then makes them permanent. The official site labels
  // every one of these blocks explicitly, so once it has given us the Dual/Link
  // text its verdict on the other two slots is final, including "empty".
  //
  // Verified against the official pages: all 10 Option-type Link cards
  // (BT24-091, BT25-100, ST22-09 …) have [Effect] / [Link DP] / [Link Condition]
  // / [Link Effect] and NO [Security Effect] block at all.
  //
  // Deliberately scoped to Dual/Link cards. I tried making this site
  // authoritative for all three text blocks on every card and measured the
  // result: it deletes the English security effect of EX10-012/020/035/057,
  // which world.digimoncard.com omits entirely while digimoncard.com prints a
  // [セキュリティ効果] for it. The EN site is not complete enough to treat its
  // silence as a fact.
  const clearMisfiledBlocks = db.prepare(
    `UPDATE cards
        SET inherited_effect = NULLIF(@inherited_effect, ''),
            security_effect  = NULLIF(@security_effect, '')
      WHERE code = @code AND (dual_effect IS NOT NULL OR link_requirement IS NOT NULL)`,
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
      if (r.dual_effect || r.link_requirement) {
        clearMisfiledBlocks.run({
          code: r.code,
          inherited_effect: r.inherited_effect ?? "",
          security_effect: r.security_effect ?? "",
        });
      }
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
  reportProgress(
    { script: "scrape-digimon-metadata", done: 0, total: prefixes.length },
    true,
  );
  for (const [pi, pfx] of prefixes.entries()) {
    process.stdout.write(`  ${pfx}: `);
    reportProgress({
      script: "scrape-digimon-metadata",
      done: pi,
      total: prefixes.length,
      note: pfx,
    },
      true,
    );
    try {
      // Search with a trailing hyphen so prefixes like "BT1" don't also match BT10..BT19
      const html = await postSearch(`${pfx}-`);
      let cards = parseAll(html);
      warnUnknownLabels(`en ${pfx}`);
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
