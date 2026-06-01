import { describe, expect, it } from "vitest";
import {
  parseDetailPage,
  parseListPage,
  resolveImageUrl,
  toInt,
  uaCardId,
} from "@/lib/scraper/ua";
import {
  FIXTURE_DETAIL_AP,
  FIXTURE_DETAIL_CHARACTER,
  FIXTURE_DETAIL_EMPTY,
  FIXTURE_DETAIL_EVENT,
  FIXTURE_LIST,
} from "./fixtures/ua-pages";

describe("UA helpers", () => {
  it("uaCardId rewrites / and _ to -", () => {
    expect(uaCardId("EX01BT/HTR-2-001")).toBe("jp-EX01BT-HTR-2-001");
    expect(uaCardId("EX01BT/HTR-1-030_p1")).toBe("jp-EX01BT-HTR-1-030-p1");
  });

  it("toInt parses leading numbers, returns 0 on -/blank", () => {
    expect(toInt("黄3")).toBe(3);
    expect(toInt("青2")).toBe(2);
    expect(toInt("3500")).toBe(3500);
    expect(toInt("-")).toBe(0);
    expect(toInt("")).toBe(0);
    expect(toInt(null)).toBe(0);
  });

  it("resolveImageUrl makes relative absolute and strips cache buster", () => {
    expect(resolveImageUrl("/jp/images/cardlist/card/X.png?v8")).toBe(
      "https://www.unionarena-tcg.com/jp/images/cardlist/card/X.png",
    );
    expect(resolveImageUrl("")).toBe("");
  });
});

describe("parseDetailPage — Character card", () => {
  it("extracts every field from a normal Character row", () => {
    const c = parseDetailPage(FIXTURE_DETAIL_CHARACTER, "EX01BT/HTR-2-001");
    expect(c).not.toBeNull();
    expect(c!.code).toBe("EX01BT/HTR-2-001");
    expect(c!.name).toBe("アベンガネ");
    expect(c!.name_reading).toBe("あべんがね");
    expect(c!.series).toBe("HUNTER×HUNTER");
    expect(c!.rarity).toBe("U");
    expect(c!.card_type).toBe("Character");
    expect(c!.color).toBe("Yellow");
    expect(c!.energy_cost).toBe(3);
    expect(c!.ap_cost).toBe(1);
    expect(c!.bp).toBe(3500);
    expect(c!.trigger_text).toBeNull();
    expect(c!.effect_text).toContain("[登場時]");
    expect(c!.effect_text).toContain("\n"); // <br> preserved
    expect(c!.image_url).toBe(
      "https://www.unionarena-tcg.com/jp/images/cardlist/card/EX01BT_HTR-2-001.png",
    );
    expect(c!.source_url).toBe(
      "https://www.unionarena-tcg.com/jp/cardlist/detail.php?card_no=EX01BT%2FHTR-2-001",
    );
  });
});

describe("parseDetailPage — Event card", () => {
  it("handles BP='-' (no BP) and trigger with icon", () => {
    const c = parseDetailPage(FIXTURE_DETAIL_EVENT, "EX01BT/HTR-1-030_p1");
    expect(c).not.toBeNull();
    // Canonical code is the REQUESTED one (with _p1), even though cardNumData
    // strips parallel suffixes.
    expect(c!.code).toBe("EX01BT/HTR-1-030_p1");
    expect(c!.name).toBe("同行");
    expect(c!.card_type).toBe("Event");
    expect(c!.color).toBe("Blue"); // 青2
    expect(c!.energy_cost).toBe(2);
    expect(c!.bp).toBe(0); // "-"
    expect(c!.rarity).toBe("C★");
    expect(c!.trigger_text).toContain("[ドロー]");
    expect(c!.trigger_text).toContain("カードを1枚引く");
    // Alt-art image URL (with _p1) is preserved end-to-end.
    expect(c!.image_url).toContain("EX01BT_HTR-1-030_p1.png");
    expect(c!.source_url).toContain("card_no=EX01BT%2FHTR-1-030_p1");
  });
});

describe("parseDetailPage — Action Point card", () => {
  it("tolerates blank rarity and color=Unknown", () => {
    const c = parseDetailPage(FIXTURE_DETAIL_AP, "EX01BT/HTR-1-AP");
    expect(c).not.toBeNull();
    expect(c!.card_type).toBe("Action Point");
    expect(c!.color).toBe("Unknown");
    expect(c!.energy_cost).toBe(0);
    expect(c!.ap_cost).toBe(0);
    expect(c!.bp).toBe(0);
    expect(c!.rarity).toBe("");
    expect(c!.trigger_text).toBeNull();
    expect(c!.effect_text).toBeNull(); // dash collapses to null
  });
});

describe("parseDetailPage — broken page", () => {
  it("returns null when the card detail block is absent", () => {
    const c = parseDetailPage(FIXTURE_DETAIL_EMPTY, "EX01BT/HTR-2-001");
    expect(c).toBeNull();
  });
});

describe("parseListPage", () => {
  it("extracts code + name + image_url for every li.cardImgCol", () => {
    const entries = parseListPage(FIXTURE_LIST);
    expect(entries).toHaveLength(4);

    const byCode = new Map(entries.map((e) => [e.code, e]));
    expect(byCode.get("EX01BT/HTR-1-030_p1")?.name).toBe("同行");
    expect(byCode.get("EX01BT/HTR-1-030_p1")?.image_url).toContain(
      "EX01BT_HTR-1-030_p1.png",
    );
    expect(byCode.get("EX01BT/HTR-2-008_p1")?.name).toBe("レイザー");

    // Alt-art rows preserve parallel suffix in `code` (this is the inventory
    // that drives detail-fetching).
    expect(entries.some((e) => e.code.endsWith("_p1"))).toBe(true);
    // Base rows DO NOT carry a suffix.
    expect(entries.some((e) => e.code === "EX01BT/HTR-2-001")).toBe(true);
  });

  it("returns empty array for blank HTML", () => {
    expect(parseListPage("")).toEqual([]);
    expect(parseListPage("<html></html>")).toEqual([]);
  });
});
