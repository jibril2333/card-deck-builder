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

const DB_PATH = path.join(process.cwd(), "data.nosync", "digimon.db");
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

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CARD_TRANSLATIONS_DDL);
  const upsert = db.prepare(UPSERT_TRANSLATION_SQL);

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
        upsert.run({
          code,
          lang: "zh",
          name,
          card_type: clean(c.belongsType),
          series: null,
          traits: clean(c.type),
          form: clean(c.form),
          attribute: clean(c.attribute),
          effect_main: clean(c.effect),
          effect_2: clean(c.safeEffect),
          effect_3: clean(c.envolutionEffect),
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
