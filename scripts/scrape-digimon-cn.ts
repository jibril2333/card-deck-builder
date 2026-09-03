/**
 * Scrape CHINESE card text from the official CN Digimon site's JSON API into
 * `card_translations` (lang='zh').
 *
 * API (discovered from the digimoncard.cn SPA bundle):
 *   GET https://dtcgweb-api.digimoncard.cn/gamecard/gamecardmanager/weblist
 *       ?page=&limit=                → paginated full card list
 *   (NB: the server silently IGNORES unknown param names like pageNum/pageSize
 *   and serves page 1 × size 10 — probe with small limits when in doubt.)
 *
 * Each row carries everything we need: `model` is the card code (BT1-001),
 * plus CN name / 三段效果 / 形态 / 属性 / 特征 / CN card image.
 *
 * Parallel printings get their OWN rows. Since roughly BT7 they carry a
 * suffixed model — `BT12-085_01`, `BT12-085_LM06`, `BT11-064_BT25` — while
 * BT1–BT6 and EX1/EX2 just repeat the bare code. Only the artwork differs;
 * the text belongs to the base code either way, so a suffixed row contributes
 * an image and nothing else (see `groupCnArt`).
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-cn.ts
 */

import Database from "better-sqlite3";
import path from "node:path";
import {
  CARD_TRANSLATIONS_DDL,
  UPSERT_TRANSLATION_SQL,
} from "../src/lib/db/translations-ddl";
import {
  chooseCnTextRows,
  cleanEffect,
  cnEvolutionCost,
  groupCnArt,
  splitCnDual,
  splitCnLink,
  splitCnRequirements,
  type CnArtRow,
} from "../src/lib/scraper/digimon-cn";
import { reportProgress } from "../src/lib/refresh-progress";
import { recordSourceRun } from "../src/lib/scrape-health";

// CDB_DATA_DIR lets a long run write a COPY of the DB while the prod container
// keeps serving the real one (host writes to the bind-mounted DB corrupt the
// container's view — see AGENTS.md).
const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);
const API = "https://dtcgweb-api.digimoncard.cn/gamecard/gamecardmanager/weblist";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 300;

type CnCard = {
  model: string; // card code, e.g. "BT1-001"
  name: string;
  belongsType: string | null; // 数码蛋 / 数码宝贝 / 驯兽师 / 选项卡
  type: string | null; // digi types CN, e.g. 球根型
  form: string | null; // 幼年期 …
  attribute: string | null;
  effect: string | null; // main effect
  safeEffect: string | null; // security effect
  envolutionEffect: string | null; // inherited effect
  envolutionConsumeOne: string | null; // digivolve cost, "绿Lv.4起4；黑Lv.4起4"
  imageCover: string | null;
};

function clean(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v && v !== "-" ? v : null;
}

async function fetchPage(pageNum: number): Promise<{
  list: CnCard[];
  totalPage: number;
}> {
  const r = await fetch(`${API}?page=${pageNum}&limit=${PAGE_SIZE}`, {
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`page ${pageNum}: HTTP ${r.status}`);
  const j = (await r.json()) as {
    code: number;
    page: { totalPage: number; list: CnCard[] };
  };
  if (j.code !== 0) throw new Error(`page ${pageNum}: api code ${j.code}`);
  return { list: j.page.list, totalPage: j.page.totalPage };
}

/**
 * Persist the Chinese artwork as `card_images` rows (lang='zh').
 *
 * Grouping and ordering live in `groupCnArt` (unit-tested); this only writes.
 * Only codes we actually carry get rows — the CN list contains plenty of models
 * our `cards` table doesn't have.
 */
function writeZhCardImages(
  db: Database.Database,
  art: Map<string, { base: string; alts: string[] }>,
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_images (
      code TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en',
      variant TEXT NOT NULL,
      image_url TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (code, lang, variant)
    )
  `);
  const cols = db
    .prepare("SELECT name FROM pragma_table_info('card_images')")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "lang")) {
    throw new Error(
      "card_images has no `lang` column — run the app once (migration 19) or " +
        "scrape-digimon-alt-arts.ts first.",
    );
  }

  const known = new Set(
    (db.prepare("SELECT code FROM cards").all() as { code: string }[]).map(
      (r) => r.code,
    ),
  );
  const ins = db.prepare(
    `INSERT INTO card_images (code, lang, variant, image_url) VALUES (?, 'zh', ?, ?)
     ON CONFLICT(code, lang, variant) DO UPDATE SET
       image_url = excluded.image_url, checked_at = CURRENT_TIMESTAMP`,
  );
  // A card that loses a printing upstream would otherwise keep the stale row
  // forever, and the leftover `_P3` would outlive the `_P2` that replaced it.
  const dropExtra = db.prepare(
    `DELETE FROM card_images WHERE lang = 'zh' AND code = ? AND variant <> ''
       AND variant NOT IN (SELECT value FROM json_each(?))`,
  );
  // Keep the translation's main image pointing at the BASE print rather than
  // whichever row happened to be written last.
  const fixMain = db.prepare(
    `UPDATE card_translations SET image_url = ? WHERE code = ? AND lang = 'zh'`,
  );

  let rows = 0;
  let codes = 0;
  let withAlt = 0;
  const tx = db.transaction(() => {
    for (const [code, { base, alts }] of art) {
      if (!known.has(code)) continue;
      ins.run(code, "", base);
      fixMain.run(base, code);
      rows++;
      const variants = alts.map((_, i) => `_P${i + 1}`);
      alts.forEach((u, i) => {
        ins.run(code, variants[i], u);
        rows++;
      });
      dropExtra.run(code, JSON.stringify(variants));
      codes++;
      if (alts.length) withAlt++;
    }
  });
  tx();
  return { rows, codes, withAlt };
}

/**
 * Remove zh translation rows for models that aren't cards.
 *
 * Every suffixed printing used to be upserted as if it were its own card, so
 * the table accumulated thousands of rows keyed `BT12-085_01` and friends.
 * Nothing reads them (every query joins on `cards.code`), but they make the
 * table lie about its size and hide real coverage gaps.
 *
 * Guarded on a sane `cards` count: against a half-built database this would
 * otherwise delete every Chinese translation we have.
 */
function pruneOrphanTranslations(db: Database.Database): number {
  const cards = (
    db.prepare("SELECT COUNT(*) n FROM cards").get() as { n: number }
  ).n;
  if (cards < 1000) {
    console.warn(`[cn] only ${cards} cards — skipping orphan prune`);
    return 0;
  }
  return db
    .prepare(
      `DELETE FROM card_translations
        WHERE lang = 'zh' AND code NOT IN (SELECT code FROM cards)`,
    )
    .run().changes;
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CARD_TRANSLATIONS_DDL);
  const upsert = db.prepare(UPSERT_TRANSLATION_SQL);
  // Language-independent, so it belongs on `cards`. The CN feed is often the
  // earliest source to carry a JP-only set, so let it fill this in too.
  const fillLinkDp = db.prepare(
    `UPDATE cards SET link_dp = COALESCE(@link_dp, link_dp) WHERE code = @code`,
  );

  // Nothing is written during the crawl. Both the artwork and the text have to
  // be decided per CARD, and a card's printings are scattered across the
  // pagination — which art becomes `_P1`, and which row supplies the text when
  // the bare code never appears, both need every page in hand first.
  const feed: CnCard[] = [];

  let page = 1;
  let totalPage = 1;
  do {
    const { list, totalPage: tp } = await fetchPage(page);
    totalPage = tp;
    for (const c of list) {
      if (clean(c.model) && clean(c.name)) feed.push(c);
    }
    reportProgress({
      script: "scrape-digimon-cn",
      done: page,
      total: totalPage,
      note: `第 ${page} 页`,
    },
      true,
    );
    if (page % 10 === 0 || page === totalPage) {
      console.log(`[cn] page ${page}/${totalPage} (${feed.length} rows)`);
    }
    page++;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  } while (page <= totalPage);

  const artRows: CnArtRow[] = feed.map((c) => ({
    model: clean(c.model)!,
    imageCover: clean(c.imageCover),
  }));

  const textRows = chooseCnTextRows(feed.map((c) => ({ ...c, model: clean(c.model)! })));
  let total = 0;
  {
    const tx = db.transaction(() => {
      for (const [code, c] of textRows) {
        const name = clean(c.name)!;
        const { main, req } = splitCnRequirements(cleanEffect(c.effect));
        // A card is Dual or Link, never both, and both hide in the same field.
        const dual = splitCnDual(cleanEffect(c.envolutionEffect));
        const link = splitCnLink(dual.inherited);
        upsert.run({
          code,
          lang: "zh",
          name,
          // The feed calls a Dual card a plain 数码宝贝; the official sites
          // call it デジモン/オプション. Say so, or the card page gives no hint
          // that there's a second face at all.
          card_type: dual.dualEffect ? "数码宝贝/选项" : clean(c.belongsType),
          series: null,
          traits: clean(c.type),
          form: clean(c.form),
          attribute: clean(c.attribute),
          effect_main: main,
          effect_2: cleanEffect(c.safeEffect),
          effect_3: link.inherited,
          // `req` is what we peeled off the top of the effect body; the cost
          // line has its own field and was simply never read, so Chinese
          // readers got the ENGLISH digivolve cost via the display fallback.
          evo_cost: cnEvolutionCost(c.envolutionConsumeOne),
          evo_req: req,
          dual_name: dual.dualName,
          dual_effect: dual.dualEffect,
          dual_rule: dual.dualRule,
          link_requirement: link.linkRequirement,
          link_effect: link.linkEffect,
          // [特別ルール] has no counterpart in the CN feed at all.
          special_rule: null,
          image_url: clean(c.imageCover),
        });
        if (link.linkDp !== null) fillLinkDp.run({ code, link_dp: link.linkDp });
        total++;
      }
    });
    tx();
    console.log(`[cn] upserted ${total} translation rows`);
  }

  const imgWritten = writeZhCardImages(db, groupCnArt(artRows));
  const pruned = pruneOrphanTranslations(db);
  if (pruned) console.log(`[cn] pruned ${pruned} orphan zh translation rows`);
  console.log(
    `[cn] card_images(zh): ${imgWritten.rows} rows for ${imgWritten.codes} codes ` +
      `(${imgWritten.withAlt} with alt art)`,
  );

  const have = db
    .prepare(
      `SELECT COUNT(*) AS n FROM cards c
       WHERE EXISTS (SELECT 1 FROM card_translations t
                     WHERE t.code = c.code AND t.lang = 'zh')`,
    )
    .get() as { n: number };
  const all = db.prepare("SELECT COUNT(*) AS n FROM cards").get() as {
    n: number;
  };
  // Coverage, not `total`: upserts only count what CHANGED, and a quiet
  // week would read as a dead source.
  recordSourceRun("中文卡表", have.n);
  console.log(
    `[cn] done. upserted ${total}; coverage ${have.n}/${all.n} cards in DB`,
  );
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
