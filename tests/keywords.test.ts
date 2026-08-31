import { existsSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { KEYWORDS } from "@/lib/keywords";
import { NON_KEYWORDS } from "@/lib/keyword-derive";

/**
 * The keyword list on the game-knowledge page against the official one.
 *
 * `card_keywords` is scraped from the official site's own search dropdown, so
 * it gains a new set's keywords the day the set ships, and the page now builds
 * its rows from that list rather than from the hand-written file. What is
 * still hand-written is the Chinese explanation — and a keyword with no
 * explanation yet is a thin row, not a missing one.
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

  dbIt("can show every keyword the official list carries", () => {
    // The page no longer prints only what has been written up by hand: its
    // rows come from this same scraped list, with the ja / zh spelling derived
    // from the cards (lib/keyword-derive) and the Chinese explanation merged
    // in where one exists. So the bar is no longer "documented" — it is
    // "showable": a keyword must reach the page with at least a name.
    const db = new Database(DB, { readonly: true });
    try {
      const official = new Set(
        (
          db
            .prepare(`SELECT keyword FROM card_keywords WHERE lang = 'en'`)
            .all() as { keyword: string }[]
        )
          .map((r) => base(r.keyword))
          .filter((k) => k && !NON_KEYWORDS.has(k)),
      );
      const named = new Map(
        (
          db.prepare(`SELECT official, ja, zh FROM keyword_names`).all() as {
            official: string;
            ja: string | null;
            zh: string | null;
          }[]
        ).map((r) => [r.official, r]),
      );
      const documented = new Set(
        KEYWORDS.flatMap((k) => [k.official, ...(k.aka ?? [])]),
      );

      const nameless = [...official]
        .filter((k) => {
          const n = named.get(k);
          return !documented.has(k) && !n?.ja && !n?.zh;
        })
        .sort();
      expect(
        nameless,
        `既没有写进 keywords.ts,也没能从卡面推出名字: ${nameless.join(", ")}`,
      ).toEqual([]);
    } finally {
      db.close();
    }
  });
});
