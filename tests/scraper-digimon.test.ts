import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  parseAll,
  parseCardBlock,
  levelFromText,
  toInt,
  normalize,
  ndOrNull,
} from "@/lib/scraper/digimon";
import {
  FIXTURE_BROKEN,
  FIXTURE_DIGI_EGG,
  FIXTURE_DIGIMON_BASE,
  FIXTURE_DUAL,
  FIXTURE_FULL_PAGE,
} from "./fixtures/digimon-card-blocks";

describe("scraper helpers", () => {
  it("normalize collapses whitespace and trims", () => {
    expect(normalize("  hello\n\nworld   ")).toBe("hello world");
    expect(normalize(undefined)).toBe("");
  });

  it("ndOrNull returns null for blank, normalized string otherwise", () => {
    expect(ndOrNull("   ")).toBeNull();
    expect(ndOrNull(" foo  bar ")).toBe("foo bar");
  });

  it("toInt picks the first signed integer in the string", () => {
    expect(toInt("3000")).toBe(3000);
    expect(toInt("Cost 4")).toBe(4);
    expect(toInt("-2")).toBe(-2);
    expect(toInt(null)).toBeNull();
    expect(toInt("")).toBeNull();
  });

  it("levelFromText handles Lv4 / Lv.4 / Lv 4", () => {
    expect(levelFromText("Lv.4")).toBe(4);
    expect(levelFromText("Lv 6")).toBe(6);
    expect(levelFromText("Lv7")).toBe(7);
    expect(levelFromText("Champion")).toBeNull();
    expect(levelFromText(null)).toBeNull();
  });
});

describe("parseCardBlock", () => {
  function parseFirst(html: string) {
    const $ = cheerio.load(html);
    const block = $(".popupCol").first()[0]!;
    return parseCardBlock($, block);
  }

  it("parses a normal Digimon card end-to-end", () => {
    const c = parseFirst(FIXTURE_DIGIMON_BASE);
    expect(c).not.toBeNull();
    expect(c!.code).toBe("BT25-001");
    expect(c!.name).toBe("Greymon");
    expect(c!.rarity).toBe("C");
    expect(c!.card_type).toBe("Digimon");
    expect(c!.level).toBe(4);
    expect(c!.color).toBe("Red");
    expect(c!.color2).toBeNull();
    expect(c!.play_cost).toBe(4);
    expect(c!.dp).toBe(3000);
    expect(c!.form).toBe("Champion");
    expect(c!.stage).toBe("Champion"); // stage mirrors form
    expect(c!.attribute).toBe("Vaccine");
    expect(c!.digi_types).toBe("Dinosaur");
    expect(c!.evolution_cost).toContain("from Lv.3");
    expect(c!.main_effect).toBe("When this Digimon attacks,\ndraw 1.");
    expect(c!.inherited_effect).toBe("+1000 DP.");
    expect(c!.security_effect).toBeNull();
    expect(c!.set_names).toBe("BT25 Booster");
    expect(c!.image_url).toBe(
      "https://world.digimoncard.com/images/cardlist/card/BT25-001.png",
    );
  });

  it("normalizes Digimon/Option to Dual and only uses the Color cell (not Digivolve Cost)", () => {
    const c = parseFirst(FIXTURE_DUAL);
    expect(c).not.toBeNull();
    expect(c!.code).toBe("BT12-050");
    expect(c!.card_type).toBe("Dual");
    // Green is in the Color cell; Blue is only in Digivolve Cost — must not leak.
    expect(c!.color).toBe("Green");
    expect(c!.color2).toBeNull();
  });

  it("normalizes lower-cased Digi-egg to Digi-Egg", () => {
    const c = parseFirst(FIXTURE_DIGI_EGG);
    expect(c).not.toBeNull();
    expect(c!.card_type).toBe("Digi-Egg");
    expect(c!.color).toBe("White");
    expect(c!.inherited_effect).toBe("+1000 DP.");
  });

  it("returns null when cardNo is empty", () => {
    const c = parseFirst(FIXTURE_BROKEN);
    expect(c).toBeNull();
  });

  it("strips cache-buster query string from image_url", () => {
    const c = parseFirst(FIXTURE_DIGIMON_BASE);
    expect(c!.image_url).not.toContain("?");
  });
});

describe("parseAll", () => {
  it("dedupes by code, preferring the base printing over _P1", () => {
    const cards = parseAll(FIXTURE_FULL_PAGE);
    // BT25-001 (base + alt), BT12-050, ST1-01 → 3 unique cards. Broken is skipped.
    expect(cards).toHaveLength(3);
    const greymon = cards.find((c) => c.code === "BT25-001");
    expect(greymon).toBeDefined();
    // The base art (no _P suffix) must win even though the alt-art block came
    // first in the HTML — that's the whole point of the dedupe pass.
    expect(greymon!.image_url).toBe(
      "https://world.digimoncard.com/images/cardlist/card/BT25-001.png",
    );
    expect(greymon!.rarity).toBe("C"); // base rarity, not alt's "SR"
  });

  it("returns empty array for blank HTML", () => {
    expect(parseAll("")).toEqual([]);
    expect(parseAll("<html><body></body></html>")).toEqual([]);
  });
});
