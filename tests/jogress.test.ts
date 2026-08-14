import { describe, it, expect } from "vitest";
import {
  computeDeckJogress,
  describeCondition,
  matchesSide,
  parseJogress,
  type JogressCard,
} from "@/lib/jogress";

/**
 * Every requirement string here is copied verbatim out of the live database
 * (`card_translations.evo_req` where lang='ja'), including the trailing
 * boilerplate sentence some of them carry and the two different ways the
 * cost is written.
 */

const card = (p: Partial<JogressCard> & { id: string }): JogressCard => ({
  code: p.id,
  name: p.id,
  card_type: "Digimon",
  color: null,
  color2: null,
  level: null,
  quantity: 1,
  ...p,
});

describe("parseJogress", () => {
  it("reads the plain colour+level form", () => {
    const [c] = parseJogress("〔ジョグレス〕青Lv.4+緑Lv.4:コスト0");
    expect(c.cost).toBe(0);
    expect(c.sides[0]).toMatchObject({ colors: ["Blue"], level: 4, parsed: true });
    expect(c.sides[1]).toMatchObject({ colors: ["Green"], level: 4, parsed: true });
  });

  it("reads the older 'から0' cost wording", () => {
    // BT12-028 and everything from that era writes the cost after から.
    const [c] = parseJogress(
      "〔ジョグレス〕青Lv.4+緑Lv.4から0\n指定のデジモン2体を重ね、アクティブで進化する",
    );
    expect(c.cost).toBe(0);
    expect(c.sides[0].level).toBe(4);
    expect(c.sides[1].colors).toEqual(["Green"]);
  });

  it("keeps both colour options on a side", () => {
    const [c] = parseJogress("〔ジョグレス〕青/黄Lv.5+緑/黒Lv.5:コスト0");
    expect(c.sides[0].colors).toEqual(["Blue", "Yellow"]);
    expect(c.sides[1].colors).toEqual(["Green", "Black"]);
  });

  it("drops the trailing rules sentence rather than parsing it as a side", () => {
    const [c] = parseJogress(
      "〔ジョグレス〕黄Lv.6+黒Lv.6:コスト0 指定のデジモン2体を重ね、アクティブで進化する",
    );
    expect(c.sides[1]).toMatchObject({ colors: ["Black"], level: 6, parsed: true });
  });

  it("reads a name-fragment requirement", () => {
    const [c] = parseJogress(
      "〔ジョグレス〕名称に「グレイモン」を含むLv.6+名称に「ガルルモン」を含むLv.6:コスト0",
    );
    expect(c.sides[0]).toMatchObject({ nameContains: "グレイモン", level: 6 });
    expect(c.sides[1]).toMatchObject({ nameContains: "ガルルモン", level: 6 });
  });

  it("reads two specifically-named Digimon", () => {
    const [c] = parseJogress("〔ジョグレス〕「キメラモン」+「ムゲンドラモン」:コスト0");
    expect(c.sides[0].exactName).toBe("キメラモン");
    expect(c.sides[1].exactName).toBe("ムゲンドラモン");
  });

  it("reads a card-text requirement", () => {
    // BT20-081, the one card whose side names what the TEXT must mention.
    const [c] = parseJogress(
      "〔ジョグレス〕「フェンリルガモン」+「パルスモン」の記述がある黄のLv.6:コスト0",
    );
    expect(c.sides[0].exactName).toBe("フェンリルガモン");
    expect(c.sides[1]).toMatchObject({
      mentions: "パルスモン",
      colors: ["Yellow"],
      level: 6,
    });
  });

  it("reads the level-only condition", () => {
    const [c] = parseJogress("〔ジョグレス〕Lv.4+Lv.4から0");
    expect(c.sides[0]).toMatchObject({ level: 4, colors: [], parsed: true });
  });

  it("returns both conditions when a card has two", () => {
    const cs = parseJogress(
      "〔ジョグレス〕紫/黒Lv.6+黄/緑Lv.6:コスト0\n〔ジョグレス〕「ピエモン」+「ヴァンデモン」:コスト0",
    );
    expect(cs).toHaveLength(2);
    expect(cs[1].sides[0].exactName).toBe("ピエモン");
  });

  it("ignores the ordinary digivolve line above it", () => {
    const cs = parseJogress(
      "〔進化〕特徴に「フリー」/「ヒーロー」を持つLv.4:コスト3\n〔ジョグレス〕青Lv.4+緑Lv.4:コスト0",
    );
    expect(cs).toHaveLength(1);
    expect(cs[0].sides[0].colors).toEqual(["Blue"]);
  });

  it("says so instead of guessing when it can't read a side", () => {
    const [c] = parseJogress("〔ジョグレス〕なにか新しい書き方:コスト0");
    expect(c.sides[0].parsed).toBe(false);
    // The reader still sees the requirement, in the card's own words.
    expect(describeCondition(c)).toContain("なにか新しい書き方");
  });

  it("finds nothing on a card with no condition", () => {
    expect(parseJogress(null)).toEqual([]);
    expect(parseJogress("〔進化〕Lv.5:コスト3")).toEqual([]);
  });
});

describe("matchesSide", () => {
  const [cond] = parseJogress("〔ジョグレス〕黄Lv.6+黒/青Lv.6:コスト0");
  const [yellow6, blackOrBlue6] = cond.sides;

  it("matches on either of a two-colour card's colours", () => {
    const c = card({ id: "a", color: "Red", color2: "Yellow", level: 6 });
    expect(matchesSide(c, yellow6)).toBe(true);
  });

  it("matches any one of the side's colour options", () => {
    expect(matchesSide(card({ id: "a", color: "Blue", level: 6 }), blackOrBlue6)).toBe(true);
    expect(matchesSide(card({ id: "b", color: "Black", level: 6 }), blackOrBlue6)).toBe(true);
    expect(matchesSide(card({ id: "c", color: "Green", level: 6 }), blackOrBlue6)).toBe(false);
  });

  it("holds the level exactly", () => {
    expect(matchesSide(card({ id: "a", color: "Yellow", level: 5 }), yellow6)).toBe(false);
  });

  it("won't take a Tamer as material", () => {
    // Colourless-looking conditions ("Lv.4+Lv.4") would otherwise sweep up
    // every Tamer in the deck, none of which can be digivolution material.
    const [lv4] = parseJogress("〔ジョグレス〕Lv.4+Lv.4から0");
    const tamer = card({ id: "t", card_type: "Tamer", color: "Yellow", level: null });
    expect(matchesSide(tamer, lv4.sides[0])).toBe(false);
  });

  it("matches a name fragment against the Japanese name, not the English one", () => {
    const [c] = parseJogress("〔ジョグレス〕名称に「グレイモン」を含むLv.6+名称に「ガルルモン」を含むLv.6:コスト0");
    const war = card({ id: "w", name: "WarGreymon", jaName: "ウォーグレイモン", level: 6 });
    expect(matchesSide(war, c.sides[0])).toBe(true);
    expect(matchesSide(war, c.sides[1])).toBe(false);
    // No Japanese row → the fragment can't match, and we say no rather than
    // falling back to a fuzzy English guess.
    const noJa = card({ id: "n", name: "WarGreymon", level: 6 });
    expect(matchesSide(noJa, c.sides[0])).toBe(false);
  });

  it("requires the exact name, not a longer one containing it", () => {
    const [c] = parseJogress("〔ジョグレス〕「フェンリルガモン」+「カヅチモン」:コスト0");
    expect(matchesSide(card({ id: "x", jaName: "フェンリルガモン" }), c.sides[0])).toBe(true);
    expect(
      matchesSide(card({ id: "y", jaName: "フェンリルガモン：建御雷神ACE" }), c.sides[0]),
    ).toBe(false);
  });

  it("matches a trait exactly, not as a substring", () => {
    const [c] = parseJogress("〔ジョグレス〕特徴に「フリー」を持つLv.4+緑Lv.4:コスト0");
    expect(matchesSide(card({ id: "a", jaTraits: "竜型/フリー", level: 4 }), c.sides[0])).toBe(true);
    expect(matchesSide(card({ id: "b", jaTraits: "フリーダム", level: 4 }), c.sides[0])).toBe(false);
  });
});

describe("computeDeckJogress", () => {
  /** A deck around BT16-036 Chaosmon: 黄Lv.6 + 黒Lv.6. */
  const deck = (): JogressCard[] => [
    card({
      id: "chaos",
      code: "BT16-036",
      card_type: "Digimon",
      color: "Yellow",
      color2: "Black",
      level: 7,
      jaEvoReq: "〔ジョグレス〕黄Lv.6+黒Lv.6:コスト0 指定のデジモン2体を重ね、アクティブで進化する",
    }),
    card({ id: "y6", color: "Yellow", level: 6 }),
    card({ id: "b6", color: "Black", level: 6 }),
    card({ id: "y5", color: "Yellow", level: 5 }),
    card({ id: "tamer", card_type: "Tamer", color: "Black" }),
  ];

  it("finds the pair the deck can actually assemble", () => {
    const m = computeDeckJogress(deck());
    const [opt] = m.get("chaos")!;
    expect(opt.pairs).toEqual([["y6", "b6"]]);
    expect(opt.label).toBe("黄 Lv.6 ＋ 黑 Lv.6");
    expect(opt.cost).toBe(0);
  });

  it("says nothing about cards that have no condition", () => {
    const m = computeDeckJogress(deck());
    expect(m.has("y6")).toBe(false);
  });

  it("reports an empty list when the deck can't make it", () => {
    // The half that would pair with the yellow Lv.6 isn't in the deck — the
    // case the feature exists to surface.
    const cards = deck().filter((c) => c.id !== "b6");
    const [opt] = computeDeckJogress(cards).get("chaos")!;
    expect(opt.pairs).toEqual([]);
    expect(opt.parsed).toBe(true);
  });

  it("pairs a card with a second copy of itself only when the deck holds two", () => {
    const two: JogressCard[] = [
      card({
        id: "t",
        level: 7,
        jaEvoReq: "〔ジョグレス〕黄Lv.6+黄Lv.6:コスト0",
      }),
      card({ id: "solo", color: "Yellow", level: 6, quantity: 1 }),
    ];
    expect(computeDeckJogress(two).get("t")![0].pairs).toEqual([]);
    two[1] = card({ id: "solo", color: "Yellow", level: 6, quantity: 2 });
    expect(computeDeckJogress(two).get("t")![0].pairs).toEqual([["solo", "solo"]]);
  });

  it("never offers the card itself as its own material", () => {
    // A Lv.6 that DNA digivolves from two Lv.6s would otherwise be listed as
    // half of its own recipe.
    const self: JogressCard[] = [
      card({
        id: "self",
        color: "Yellow",
        level: 6,
        quantity: 4,
        jaEvoReq: "〔ジョグレス〕黄Lv.6+黄Lv.6:コスト0",
      }),
    ];
    expect(computeDeckJogress(self).get("self")![0].pairs).toEqual([]);
  });

  it("matches either half against either card", () => {
    // The deck order must not decide whether a pair is found.
    const cards = deck();
    const reversed = [cards[0], cards[2], cards[1], cards[3], cards[4]];
    expect(computeDeckJogress(reversed).get("chaos")![0].pairs).toEqual([["b6", "y6"]]);
  });

  it("keeps a card's two conditions apart", () => {
    const cards: JogressCard[] = [
      card({
        id: "bolt",
        level: 7,
        jaEvoReq:
          "〔ジョグレス〕紫/黒Lv.6+黄/緑Lv.6:コスト0\n〔ジョグレス〕「ピエモン」+「ヴァンデモン」:コスト0",
      }),
      card({ id: "p6", color: "Purple", level: 6 }),
      card({ id: "g6", color: "Green", level: 6 }),
      card({ id: "piemon", jaName: "ピエモン" }),
      card({ id: "vamdemon", jaName: "ヴァンデモン" }),
    ];
    const opts = computeDeckJogress(cards).get("bolt")!;
    expect(opts).toHaveLength(2);
    expect(opts[0].pairs).toEqual([["p6", "g6"]]);
    expect(opts[1].pairs).toEqual([["piemon", "vamdemon"]]);
  });

  it("claims no pairs for a condition it couldn't read", () => {
    const cards: JogressCard[] = [
      card({ id: "weird", jaEvoReq: "〔ジョグレス〕まったく新しい条件:コスト0" }),
      card({ id: "y6", color: "Yellow", level: 6 }),
    ];
    const [opt] = computeDeckJogress(cards).get("weird")!;
    expect(opt.parsed).toBe(false);
    expect(opt.pairs).toEqual([]);
  });
});
