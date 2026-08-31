import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { deriveKeywordNames, keywordBase } from "@/lib/keyword-derive";
import { KEYWORDS } from "@/lib/keywords";

/**
 * The derivation is checked against the 45 pairs that were worked out by hand
 * — the only ground truth there is. What matters is not the hit rate but the
 * direction of the misses: a keyword it cannot place must come back empty,
 * never placed wrongly, because the page prints the answer unattended.
 */
const DB = path.join(process.cwd(), "data.nosync", "digimon.db");
const dbIt = existsSync(DB) ? it : it.skip;

describe("keywordBase", () => {
  it("drops the per-card variant rule 16-2 calls the same keyword", () => {
    expect(keywordBase("分離《特徴「セブンコード」》")).toBe("分離");
    expect(keywordBase("オーバーフロー《-3》")).toBe("オーバーフロー");
    expect(keywordBase("1ドロー")).toBe("ドロー");
    expect(keywordBase("デジクロス2")).toBe("デジクロス");
    expect(keywordBase("抽1张卡")).toBe("抽卡");
    expect(keywordBase("Recovery +1 ≪Deck≫")).toBe("Recovery");
    expect(keywordBase("Blocker")).toBe("Blocker");
  });
});

describe("deriveKeywordNames", () => {
  dbIt("reproduces the hand-written pairs, and stays silent otherwise", () => {
    const db = new Database(DB, { readonly: true });
    try {
      const cards = db
        .prepare(
          `SELECT c.main_effect || ' ' || COALESCE(c.inherited_effect,'') || ' '
                 || COALESCE(c.security_effect,'') || ' ' || COALESCE(c.source_effect,'') AS en,
                  t.effect_main AS ja, z.effect_main AS zh
             FROM cards c
             LEFT JOIN card_translations t ON t.code = c.code AND t.lang = 'ja'
             LEFT JOIN card_translations z ON z.code = c.code AND z.lang = 'zh'`,
        )
        .all() as { en: string; ja: string | null; zh: string | null }[];
      const officialJa = (
        db
          .prepare(`SELECT keyword FROM card_keywords WHERE lang = 'ja'`)
          .all() as { keyword: string }[]
      ).map((r) => r.keyword);

      const got = deriveKeywordNames(cards, officialJa);

      const wrong: string[] = [];
      let exact = 0;
      for (const k of KEYWORDS) {
        const d = got.get(k.official);
        if (!d) continue;
        if (d.ja && d.ja !== k.ja) wrong.push(`${k.official}: ja ${d.ja} ≠ ${k.ja}`);
        if (d.zh && d.zh !== k.zhName)
          wrong.push(`${k.official}: zh ${d.zh} ≠ ${k.zhName}`);
        if (d.ja === k.ja && d.zh === k.zhName) exact++;
      }
      expect(wrong, wrong.join("\n")).toEqual([]);
      // Well over half; the rest are keywords never printed in brackets.
      expect(exact).toBeGreaterThanOrEqual(35);
    } finally {
      db.close();
    }
  });
});
