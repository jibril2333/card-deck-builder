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
 * plus CN name / 三段效果 / 形态 / 属性 / 特征 / CN card image. Parallel-art
 * printings appear as extra rows with the same `model`; text is identical so
 * last-write-wins is fine.
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
  imageCover: string | null;
};

function clean(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v && v !== "-" ? v : null;
}

/**
 * Effect-text cleaner. digimoncard.cn encodes line breaks as the literal token
 * "enter" (sometimes followed by a real newline, sometimes used alone as the
 * only separator). Normalize every "enter" to a newline and collapse the blank
 * lines that creates. Chinese card text never contains the English word, so
 * this is unambiguous.
 */
function cleanEffect(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  if (!v || v === "-") return null;
  return v
    .replace(/enter/g, "\n")
    .replace(/[ \t]*\n[ \t]*(?:\n[ \t]*)*/g, "\n")
    .trim();
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
 * The CN CDN encodes parallels with a trailing `_NN` (e.g. `BT1-009C.png` is
 * the base print, `BT1-009_01.png` its alt art), so we can tell them apart by
 * filename and map them onto the same `""`/`_P1`/`_P2` variant keys the EN/JP
 * probers use. Only codes we actually carry get rows — the CN list contains
 * plenty of models our `cards` table doesn't have.
 */
function writeZhCardImages(
  db: Database.Database,
  imagesByModel: Map<string, Set<string>>,
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
  // Keep the translation's main image pointing at the BASE print rather than
  // whichever row happened to be written last.
  const fixMain = db.prepare(
    `UPDATE card_translations SET image_url = ? WHERE code = ? AND lang = 'zh'`,
  );
  const parallelNo = (url: string) => {
    const m = url.match(/_(\d+)\.[a-z]+$/i);
    return m ? parseInt(m[1], 10) : null;
  };

  let rows = 0;
  let codes = 0;
  let withAlt = 0;
  const tx = db.transaction(() => {
    for (const [code, set] of imagesByModel) {
      if (!known.has(code)) continue;
      const all = [...set];
      const bases = all.filter((u) => parallelNo(u) === null);
      const alts = all
        .filter((u) => parallelNo(u) !== null)
        .sort((a, b) => parallelNo(a)! - parallelNo(b)!);
      // Some codes only ever appear with a `_NN` name; treat the lowest as base.
      const base = bases[0] ?? alts.shift();
      if (!base) continue;
      ins.run(code, "", base);
      fixMain.run(base, code);
      rows++;
      alts.forEach((u, i) => {
        ins.run(code, `_P${i + 1}`, u);
        rows++;
      });
      codes++;
      if (alts.length) withAlt++;
    }
  });
  tx();
  return { rows, codes, withAlt };
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CARD_TRANSLATIONS_DDL);
  const upsert = db.prepare(UPSERT_TRANSLATION_SQL);

  // Parallel-art printings come back as EXTRA rows with the same `model` but a
  // different `imageCover`. The text is identical (last-write-wins is fine for
  // the translation row), but the images are the Chinese alt arts — collect
  // them so the gallery can show CN art to CN readers instead of English.
  const imagesByModel = new Map<string, Set<string>>();

  let page = 1;
  let totalPage = 1;
  let total = 0;
  do {
    const { list, totalPage: tp } = await fetchPage(page);
    totalPage = tp;
    const tx = db.transaction(() => {
      for (const c of list) {
        const code = clean(c.model);
        const name = clean(c.name);
        if (!code || !name) continue;
        const img = clean(c.imageCover);
        if (img) {
          const set = imagesByModel.get(code) ?? new Set<string>();
          set.add(img);
          imagesByModel.set(code, set);
        }
        upsert.run({
          code,
          lang: "zh",
          name,
          card_type: clean(c.belongsType),
          series: null,
          traits: clean(c.type),
          form: clean(c.form),
          attribute: clean(c.attribute),
          effect_main: cleanEffect(c.effect),
          effect_2: cleanEffect(c.safeEffect),
          effect_3: cleanEffect(c.envolutionEffect),
          // The CN feed has no separate requirement fields (it inlines them in
          // the effect text). NULL here, and the upsert COALESCEs so a CN pass
          // never blanks what the JP scrape captured.
          evo_cost: null,
          evo_req: null,
          image_url: clean(c.imageCover),
        });
        total++;
      }
    });
    tx();
    if (page % 10 === 0 || page === totalPage) {
      console.log(`[cn] page ${page}/${totalPage} (${total} upserted)`);
    }
    page++;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  } while (page <= totalPage);

  const imgWritten = writeZhCardImages(db, imagesByModel);
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
  console.log(
    `[cn] done. upserted ${total}; coverage ${have.n}/${all.n} cards in DB`,
  );
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
