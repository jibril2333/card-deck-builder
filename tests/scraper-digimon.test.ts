import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import {
  parseAll,
  parseCardBlock,
  mergePrintings,
  JA_LABELS,
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
  FIXTURE_DUAL_FULL,
  FIXTURE_LINK_EN,
  FIXTURE_LINK_JA,
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

  it("reads both faces of a Dual card without letting either leak into the other", () => {
    const c = parseFirst(FIXTURE_DUAL_FULL);
    expect(c).not.toBeNull();
    expect(c!.code).toBe("BT25-057");
    expect(c!.card_type).toBe("Dual");

    // ---- Digimon half. `.dualCardCol` re-uses every one of these class
    // names, so each assertion here is really "the Option half stayed out".
    expect(c!.name).toBe("Monarchlizamon");
    expect(c!.color).toBe("Green");
    expect(c!.color2).toBe("Black");
    expect(c!.dp).toBe(8000);
    expect(c!.main_effect).toBe("[When Digivolving] Digimon-half effect.");
    expect(c!.evolution_requirements).toBe(
      "[Digivolve] Lv.4 w/[Glowing Dawn] trait: Cost 3",
    );
    // The Option side is NOT an inherited effect — that mislabelling is the
    // whole bug this fixture exists for.
    expect(c!.inherited_effect).toBeNull();

    // ---- Option half.
    expect(c!.dual_name).toBe("Final Judgment");
    expect(c!.dual_color).toBe("RedYellow");
    expect(c!.dual_cost).toBe(4);
    expect(c!.dual_effect).toBe(
      "<Use Req. ([Glowing Dawn] trait)>\n[Main] Option-half effect.",
    );
    expect(c!.dual_rule).toBe("<Arts Digivolve>");
  });

  it("leaves the dual_* fields null on an ordinary card", () => {
    const c = parseFirst(FIXTURE_DIGIMON_BASE);
    expect(c!.dual_name).toBeNull();
    expect(c!.dual_color).toBeNull();
    expect(c!.dual_cost).toBeNull();
    expect(c!.dual_effect).toBeNull();
    expect(c!.dual_rule).toBeNull();
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

describe("Link cards", () => {
  const parseOne = (html: string, L?: never) => {
    const $ = cheerio.load(html);
    return parseCardBlock($, $(".popupCol").get(0)!, L);
  };

  it("repairs the EN site's two separate mislabellings", () => {
    const c = parseOne(FIXTURE_LINK_EN);
    expect(c!.link_dp).toBe(2000);
    expect(c!.link_requirement).toBe(
      "＜Link＞ [Appmon] trait: Cost 1 (Plug this card in sideways.)",
    );
    expect(c!.link_effect).toBe("＜Raid＞ (Change the attack target.)");
    // Both were folded into [Inherited Effect]; what a Link card gives the
    // Digimon it plugs INTO is not what it gives the one stacked on top of it.
    expect(c!.inherited_effect).toBeNull();
    // [Special Rule] was really the Link DP block, so it shouldn't linger.
    expect(c!.special_rule).toBeNull();
    // Both digivolve lines, not just the first.
    expect(c!.evolution_cost).toBe("Red 0 from Lv.2\nRed 2 from TAMER");
  });

  it("reads the JP site's properly-labelled blocks to the same values", () => {
    const c = parseOne(FIXTURE_LINK_JA, JA_LABELS as never);
    expect(c!.link_dp).toBe(2000);
    expect(c!.link_requirement).toContain("〈リンク〉");
    expect(c!.link_effect).toContain("≪突進≫");
    expect(c!.inherited_effect).toBeNull();
  });

  it("keeps a genuine [特別ルール] out of the Link DP slot", () => {
    // BT21-051's is ≪オーバーフロー《-4》≫ — a real rules line, and the card
    // has no Link blocks at all, so nothing may reinterpret it.
    const c = parseOne(
      FIXTURE_LINK_JA.replace(
        /<dl class="cardInfoBoxSmall">\s*<dt class="cardInfoTitSmall">\[リンク(DP|条件|中効果)\][\s\S]*?<\/dl>/g,
        "",
      ).replace(
        "</div>",
        `<dl class="cardInfoBoxSmall"><dt class="cardInfoTitSmall">[特別ルール]</dt><dd class="cardInfoData">≪オーバーフロー《-4》≫</dd></dl></div>`,
      ),
      JA_LABELS as never,
    );
    expect(c!.special_rule).toBe("≪オーバーフロー《-4》≫");
    expect(c!.link_dp).toBeNull();
  });
});

describe("mergePrintings", () => {
  const base = (o: Partial<ReturnType<typeof parseCardBlock>> = {}) => {
    const $ = cheerio.load(FIXTURE_DIGIMON_BASE);
    return { ...parseCardBlock($, $(".popupCol").get(0)!)!, ...o };
  };

  it("fills a field the base printing left empty from a parallel", () => {
    // The official site contradicts itself between printings of one card, so
    // taking the base print wholesale can drop text that a parallel has.
    const merged = mergePrintings([
      base({ image_url: "x/BT25-001.png", security_effect: null }),
      base({ image_url: "x/BT25-001_P1.png", security_effect: "[Security] Do a thing." }),
    ]);
    expect(merged.security_effect).toBe("[Security] Do a thing.");
    // …without giving up the base printing's identity.
    expect(merged.image_url).toBe("x/BT25-001.png");
  });

  it("moves a Digi-Egg's impossible security effect to the inherited slot", () => {
    // A Digi-Egg lives in the egg deck and never enters the security stack, so
    // a [Security Effect] on one is the inherited effect wearing a wrong label
    // — which is exactly what P-148's and P-149's base printings carry.
    const merged = mergePrintings([
      base({
        card_type: "Digi-Egg",
        security_effect: "[When Attacking] ＜Draw 1＞.",
        inherited_effect: null,
      }),
    ]);
    expect(merged.security_effect).toBeNull();
    expect(merged.inherited_effect).toBe("[When Attacking] ＜Draw 1＞.");
  });
});
