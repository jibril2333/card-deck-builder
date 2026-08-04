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
  // Which fields a card HAS is a fact about the printed card, not about the
  // language — and the JP site is the one that gets it right. Across 520 cards
  // it prints 形態/属性 only on Digimon and Digi-Eggs, never on Tamers or
  // Options, and it puts a trait under タイプ where world.digimoncard.com
  // sometimes files the same value under "Attribute" (BT9-104's X抗体). Layer
  // digimoncard.io on top, which copies the type into `form` for Tamers, and
  // one printed field ends up rendered twice under two different labels — the
  // Option BT9-104 showed both "属性 X Antibody" and "特征 X抗体".
  //
  // So: for a card this site returned, its field set decides which of ours may
  // be populated. A card it doesn't carry is never touched — we'd have no
  // authority for it.
  //
  // NOT a per-type rule. Digi-Eggs normally have neither cost nor DP, but
  // BT22-007 genuinely costs 20 and EX2-007 genuinely has 15000 DP; a rule
  // keyed on card type would have deleted both.
  const alignFields = db.prepare(
    `UPDATE cards
        SET form      = CASE WHEN @has_form THEN form ELSE NULL END,
            stage     = CASE WHEN @has_form THEN stage ELSE NULL END,
            -- An attribute the JP site doesn't have is really the type, so
            -- move it rather than drop the only English wording we have.
            digi_types = CASE
              WHEN @has_attr THEN digi_types
              WHEN digi_types IS NULL OR digi_types = '' THEN attribute
              ELSE digi_types END,
            attribute = CASE WHEN @has_attr THEN attribute ELSE NULL END,
            dp        = CASE WHEN @has_dp THEN dp ELSE NULL END,
            play_cost = CASE WHEN @has_cost THEN play_cost ELSE NULL END,
            -- Same rule for the digivolve cells. world.digimoncard.com prints
            -- a "Digivolve Cost 1" on the Tamers BT20-088 and BT21-081 that the
            -- printed cards simply do not have — the scans show a plain Tamer,
            -- play cost and effects, no digivolve box — and a truncated "2 from"
            -- on the Option P-156. digimoncard.com has neither.
            evolution_cost = CASE WHEN @has_evocost THEN evolution_cost ELSE NULL END,
            evolution_requirements =
              CASE WHEN @has_evoreq THEN evolution_requirements ELSE NULL END
      WHERE code = @code`,
  );
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
        alignFields.run({
          code: c.code,
          has_form: c.form ? 1 : 0,
          has_attr: c.attribute ? 1 : 0,
          has_dp: c.dp !== null ? 1 : 0,
          has_cost: c.play_cost !== null ? 1 : 0,
          has_evocost: c.evolution_cost ? 1 : 0,
          has_evoreq: c.evolution_requirements ? 1 : 0,
        });
        // A Dual card's colour/cost and a Link card's DP aren't
        // language-specific, so they live on `cards` — but for JP-only sets
        // this is the only site that can see them, so they reach `cards` here.
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
  // Prefixes whose bulk search came back empty. The JP site returns NOTHING
  // for `P-` (243 promo cards), so the prefix pass has never once refreshed a
  // promo card — and the sweep below only visited codes with no ja row at all,
  // which promos all have. Their Japanese text was frozen at whatever the very
  // first scrape captured, which is why P-190 still showed its Link blocks as
  // 進化元効果 after every other Link card had been fixed.
  const emptyPrefixes: string[] = [];
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
    if (exact.length === 0) emptyPrefixes.push(prefix);
    total += upsertCards(exact);
    console.log(`[jp] ${prefix}: ${exact.length} cards`);
    await new Promise((r) => setTimeout(r, SET_DELAY_MS));
  }
  if (emptyPrefixes.length > 0) {
    console.log(
      `[jp] bulk search returned nothing for: ${emptyPrefixes.join(" ")} — ` +
        `sweeping those per code`,
    );
  }

  // Per-code sweep. Two kinds of code land here:
  //   · anything with no ja row yet (some sets paginate past the bulk result)
  //   · EVERY code of a prefix whose bulk search returned nothing — those
  //     rows exist but nothing has ever refreshed them, so "already has a
  //     translation" is exactly the wrong reason to skip them.
  const emptyLike = emptyPrefixes.map((p) => `${p}-%`);
  const emptyClause = emptyLike.length
    ? `OR ${emptyLike.map((_, i) => `c.code LIKE @e${i}`).join(" OR ")}`
    : "";
  const missing = (
    db
      .prepare(
        `SELECT code FROM cards c
         WHERE (NOT EXISTS (SELECT 1 FROM card_translations t
                            WHERE t.code = c.code AND t.lang = 'ja')
                ${emptyClause})
         ${only ? "AND c.code LIKE @p" : ""}
         ORDER BY code`,
      )
      .all({
        ...(only ? { p: `${only}-%` } : {}),
        ...Object.fromEntries(emptyLike.map((v, i) => [`e${i}`, v])),
      }) as { code: string }[]
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
