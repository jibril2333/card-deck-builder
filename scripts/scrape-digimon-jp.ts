/**
 * Scrape JAPANESE card text from the official JP Digimon cardlist into
 * `card_translations` (lang='ja').
 *
 * digimoncard.com renders the exact same DOM as world.digimoncard.com, so we
 * reuse the EN parser with the JA label map. Set prefixes are taken from the
 * codes already in our `cards` table — we only translate what we have.
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-jp.ts              # all set prefixes
 *   npx tsx scripts/scrape-digimon-jp.ts --only=BT25
 */

import Database from "better-sqlite3";
import path from "node:path";
import {
  parseAll,
  JA_LABELS,
  lastUnknownLabels,
} from "../src/lib/scraper/digimon";
import {
  checkScrapeSanity,
  formatSanityReport,
} from "../src/lib/scraper/sanity";
import {
  CARD_TRANSLATIONS_DDL,
  UPSERT_TRANSLATION_SQL,
} from "../src/lib/db/translations-ddl";

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
  const only = process.argv
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CARD_TRANSLATIONS_DDL);
  const upsert = db.prepare(UPSERT_TRANSLATION_SQL);
  const fillDual = db.prepare(
    `UPDATE cards SET dual_color = COALESCE(@dual_color, dual_color),
                      dual_cost  = COALESCE(@dual_cost, dual_cost),
                      link_dp    = COALESCE(@link_dp, link_dp)
      WHERE code = @code`,
  );

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

  console.log(`[jp] ${prefixes.length} set prefixes: ${prefixes.join(" ")}`);

  /**
   * Same gate the EN scraper has run all along — this side never did, which is
   * why the missing [デュアル効果] label went unnoticed for months: the JP
   * scrape happily wrote Dual cards with no Option half and reported success.
   * A per-code sweep legitimately hands us one card at a time, so only refuse
   * on a real batch; a single bad row would trip the ratio thresholds.
   */
  function sanityOk(cards: ReturnType<typeof parseAll>, label: string): boolean {
    if (cards.length < 5) return true;
    const report = checkScrapeSanity(cards);
    if (report.issues.length > 0) console.warn(formatSanityReport(report));
    if (!report.ok) {
      console.error(`[jp] ${label}: SANITY FAILED — refusing to write`);
      return false;
    }
    return true;
  }

  function upsertCards(cards: ReturnType<typeof parseAll>): number {
    let n = 0;
    const tx = db.transaction(() => {
      for (const c of cards) {
        if (!c.name) continue;
        upsert.run({
          code: c.code,
          lang: "ja",
          name: c.name,
          card_type: c.card_type || null,
          series: null,
          traits: c.digi_types,
          form: c.form,
          attribute: c.attribute,
          effect_main: c.main_effect,
          effect_2: c.security_effect,
          effect_3: c.inherited_effect,
          // Parsed all along, but there was nowhere to store them until
          // migration 24 — this is why the JP text lacked ジョグレス/デジクロス
          // lines that the CN text happened to inline.
          evo_cost: c.evolution_cost,
          evo_req: c.evolution_requirements,
          // Dual cards: the Option half. Nothing stored this before, so the
          // second half of every 双力 card was simply missing in Japanese.
          dual_name: c.dual_name,
          dual_effect: c.dual_effect,
          dual_rule: c.dual_rule,
          link_requirement: c.link_requirement,
          link_effect: c.link_effect,
          special_rule: c.special_rule,
          image_url: c.image_url || null,
        });
        // The Option half's colour and cost aren't language-specific, so they
        // live on `cards`. The JP site is the ONLY source that sees JP-only
        // sets (BT26 &c.), so it has to fill them in there too.
        // Values that aren't language-specific but that only the JP site sees
        // for JP-only sets, so they have to reach `cards` from here too.
        if (c.dual_effect || c.link_dp !== null) {
          fillDual.run({
            code: c.code,
            dual_color: c.dual_color,
            dual_cost: c.dual_cost,
            link_dp: c.link_dp,
          });
        }
        n++;
      }
    });
    tx();
    return n;
  }

  let total = 0;
  let failed = 0;
  for (const prefix of prefixes) {
    let cards;
    try {
      // Query with the trailing hyphen: the JP search returns nothing for
      // short bare prefixes like "BT1" but matches "BT1-" fine, and the
      // hyphen keeps BT1 from also matching BT10/BT11….
      cards = parseAll(await postSearch(`${prefix}-`), JA_LABELS);
      warnUnknownLabels(`jp ${prefix}`);
    } catch (e) {
      console.error(`[jp] ${prefix}: fetch/parse failed`, e);
      continue;
    }
    const exact = cards.filter((c) => c.code.startsWith(`${prefix}-`));
    if (!sanityOk(exact, prefix)) {
      failed++;
      continue;
    }
    total += upsertCards(exact);
    console.log(`[jp] ${prefix}: ${exact.length} cards`);
    await new Promise((r) => setTimeout(r, SET_DELAY_MS));
  }

  // Per-code sweep for whatever the prefix searches missed (very short
  // prefixes like P- return noisy/empty results; some sets paginate).
  const missing = (
    db
      .prepare(
        `SELECT code FROM cards c
         WHERE NOT EXISTS (SELECT 1 FROM card_translations t
                           WHERE t.code = c.code AND t.lang = 'ja')
         ${only ? "AND c.code LIKE @p" : ""}
         ORDER BY code`,
      )
      .all(only ? { p: `${only}-%` } : {}) as { code: string }[]
  ).map((r) => r.code);
  if (missing.length > 0) {
    console.log(`[jp] per-code sweep for ${missing.length} missing codes…`);
    let found = 0;
    for (const code of missing) {
      try {
        const cards = parseAll(await postSearch(code), JA_LABELS).filter(
          (c) => c.code === code,
        );
        found += upsertCards(cards);
      } catch {
        // EN-only cards (AD1 etc.) simply don't exist on the JP site.
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    total += found;
    console.log(`[jp] per-code sweep recovered ${found}`);
  }

  const have = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cards c
       WHERE EXISTS (SELECT 1 FROM card_translations t
                     WHERE t.code = c.code AND t.lang = 'ja')`,
    )
    .get() as { n: number };
  const all = db.prepare("SELECT COUNT(*) AS n FROM cards").get() as {
    n: number;
  };
  console.log(
    `[jp] done. upserted ${total}; coverage ${have.n}/${all.n} cards in DB`,
  );
  db.close();
  // Exit non-zero so refresh-cards.sh aborts instead of swapping in a DB that
  // is missing whatever the failing sets were supposed to contain.
  if (failed > 0) {
    console.error(`[jp] ${failed} set(s) failed the sanity gate`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
