/**
 * Scrape the official keyword-ability list into `card_keywords`.
 *
 * Why this exists: most keyword abilities are written inside brackets in card
 * text — 《阻挡者》 ≪ジャミング≫ ＜Rush＞ — so the effect renderer can spot
 * them structurally. But some are written BARE: "アセンブリ-6:「ネガーモン」4枚",
 * "デジクロス-2", "数码合体-2". Those have no delimiter to key off, so the only
 * way to highlight them is to know the vocabulary.
 *
 * Both official sites publish exactly that vocabulary as the options of the
 * search form's keyword dropdown (106 entries in JA), which makes it an
 * authoritative, self-updating list — a new set's keywords appear here the day
 * the set does.
 *
 * Run with:
 *   npx tsx scripts/scrape-digimon-keywords.ts
 */

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.join(
  process.env.CDB_DATA_DIR ?? path.join(process.cwd(), "data.nosync"),
  "digimon.db",
);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * The dropdown only renders on a SEARCH RESULT page, not the landing page, so
 * each source is fetched with a throwaway query. `label` is the heading the
 * options follow; EN and JA name it differently.
 */
const SOURCES = [
  {
    lang: "ja",
    url: "https://digimoncard.com/cards/index.php?search=true",
    label: "キーワード効果",
  },
  {
    lang: "en",
    url: "https://world.digimoncard.com/cards/index.php?search=true",
    label: "Keyword Effect",
  },
] as const;

export const CARD_KEYWORDS_DDL = `
  CREATE TABLE IF NOT EXISTS card_keywords (
    lang       TEXT NOT NULL,
    keyword    TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lang, keyword)
  )
`;

async function fetchOptions(
  url: string,
  label: string,
): Promise<string[]> {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ free: "BT1-" }).toString(),
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const html = await r.text();

  // Options directly after the heading. Falling back to a Blocker-bearing
  // <select> covers the EN page, whose heading text differs between builds.
  let seg = "";
  const i = html.indexOf(label);
  if (i >= 0) seg = html.slice(i, i + 20000);
  else {
    // [^] instead of . with /s — the dotAll flag needs a newer target than
    // this tsconfig uses, and [^] matches newlines everywhere.
    const m = html.match(
      /<select[^>]*>(?:(?!<\/select>)[^])*?(?:Blocker|Rush)(?:(?!<\/select>)[^])*?<\/select>/,
    );
    seg = m ? m[0] : "";
  }
  const opts = [...seg.matchAll(/<option value=['"]([^'"]*)['"]/g)].map(
    (m) => m[1],
  );
  return [
    ...new Set(
      opts
        .map((o) => o.trim())
        .filter((o) => o && o !== "指定なし" && o !== "Not specified"),
    ),
  ];
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(CARD_KEYWORDS_DDL);
  const ins = db.prepare(
    `INSERT INTO card_keywords (lang, keyword) VALUES (?, ?)
     ON CONFLICT(lang, keyword) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
  );

  for (const s of SOURCES) {
    let list: string[];
    try {
      list = await fetchOptions(s.url, s.label);
    } catch (e) {
      console.error(`[kw] ${s.lang}: fetch failed`, (e as Error).message);
      continue;
    }
    if (list.length === 0) {
      // Don't let a selector regression quietly empty the vocabulary.
      console.error(`[kw] ${s.lang}: parsed 0 keywords — skipping (selector drift?)`);
      continue;
    }
    db.transaction(() => {
      for (const k of list) ins.run(s.lang, k);
    })();
    console.log(`[kw] ${s.lang}: ${list.length} keywords`);
    await new Promise((r) => setTimeout(r, 500));
  }

  const total = db
    .prepare("SELECT COUNT(*) n FROM card_keywords")
    .get() as { n: number };
  console.log(`[kw] done. ${total.n} rows total.`);
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
