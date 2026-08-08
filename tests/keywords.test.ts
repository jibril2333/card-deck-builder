import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { KEYWORDS } from "@/lib/keywords";

/**
 * The keyword list on the game-knowledge page against the official one.
 *
 * `card_keywords` is scraped from the official site's own search dropdown, so
 * it gains a new set's keywords the day the set ships. The page's list is
 * written by hand from the comprehensive rules, so it does not. Comparing them
 * is what turns "the page is out of date" from something a user notices into
 * something a test says — which is how the page came to be missing 22 of the
 * 41 in the first place.
 */
const DB = path.join(process.cwd(), "data.nosync", "digimon.db");

/** Strip the numeric / named variants rule 16-2 says are the same keyword. */
function base(k: string): string {
  return k
    .replace(/\s*\(.*\)\s*$/, "") // Decoy (Black), Overflow (-3)
    .replace(/\s*≪[^≫]*≫\s*$/, "") // Fragment ≪2≫
    .replace(/\s*[+-]?\d+\s*$/, "") // Draw 1, De-Digivolve 3
    .trim();
}

describe("KEYWORDS", () => {
  it("has no duplicates and no empty fields", () => {
    const names = KEYWORDS.map((k) => k.official);
    expect(names).toEqual([...new Set(names)]);
    for (const k of KEYWORDS) {
      expect(k.official.length).toBeGreaterThan(0);
      // Card text uses ＜＞ for keyword effects and ［］ for the digivolution
      // rules (［DNA Digivolution］, ［Link］), so accept either.
      expect(k.display).toMatch(/[＜［]/);
      expect(k.zh.length).toBeGreaterThan(8);
      // All three names are required: the table's job is recognising a
      // keyword on a card, and which language that card is in varies.
      expect(k.ja.length).toBeGreaterThan(0);
      expect(k.zhName.length).toBeGreaterThan(0);
    }
  });

  it("gives each language a distinct name where the game does", () => {
    // Some genuinely coincide across ja/zh (回避, 不屈, 速攻, 退化 …), so this
    // only catches a field left as a copy of the English one.
    for (const k of KEYWORDS) {
      expect(k.ja).not.toBe(k.official);
      expect(k.zhName).not.toBe(k.official);
    }
  });

  it("has a Japanese name that the official ja list actually contains", () => {
    const db = existsSync(DB) ? new Database(DB, { readonly: true }) : null;
    if (!db) return;
    try {
      const ja = (
        db
          .prepare(`SELECT keyword FROM card_keywords WHERE lang = 'ja'`)
          .all() as { keyword: string }[]
      ).map((r) => r.keyword);
      // Substring, not equality: the scraped list carries the numeric and
      // card-name variants (デジバースト2, デコイ《黒》) while ours is the base.
      const missing = KEYWORDS.filter(
        (k) => !ja.some((o) => o.includes(k.ja)),
      ).map((k) => `${k.official}→${k.ja}`);
      expect(missing, `日文名对不上官方表: ${missing.join(", ")}`).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("spells names the way the official list does", () => {
    // Not cosmetic: matching spelling is what lets the check below work at all.
    for (const k of KEYWORDS) {
      expect(k.official).toBe(base(k.official));
    }
  });

  // Needs the real card DB, which a fresh clone won't have until the first
  // scrape. Skip rather than fail — this asserts about live data, not code.
  const dbIt = existsSync(DB) ? it : it.skip;

  dbIt("covers every keyword the official list carries", () => {
    const db = new Database(DB, { readonly: true });
    try {
      const rows = db
        .prepare(`SELECT keyword FROM card_keywords WHERE lang = 'en'`)
        .all() as { keyword: string }[];
      // Two entries in the scraped list aren't keywords:
      //   "Rule"          — the rules-note marker; section 16 doesn't define it.
      //   "BlockerDraw 1" — two <option>s run together on the official page.
      //                     Real keywords never concatenate like this, and
      //                     both halves are already documented separately.
      const NOT_KEYWORDS = new Set(["Rule", "BlockerDraw"]);
      const official = new Set(
        rows.map((r) => base(r.keyword)).filter((k) => k && !NOT_KEYWORDS.has(k)),
      );
      const documented = new Set(
        KEYWORDS.flatMap((k) => [k.official, ...(k.aka ?? [])]),
      );

      const missing = [...official].filter((k) => !documented.has(k)).sort();
      expect(missing, `官方有但页面没写: ${missing.join(", ")}`).toEqual([]);
    } finally {
      db.close();
    }
  });
});
