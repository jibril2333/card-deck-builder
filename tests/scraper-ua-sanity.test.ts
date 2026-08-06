import { describe, expect, it } from "vitest";
import { checkUASanity } from "@/lib/scraper/sanity-ua";
import type { ScrapedUACard } from "@/lib/scraper/ua";

function card(overrides: Partial<ScrapedUACard> = {}): ScrapedUACard {
  return {
    code: "EX01BT/HTR-2-001",
    name: "アベンガネ",
    name_reading: "あべんがね",
    series: "HUNTER×HUNTER",
    color: "Yellow",
    rarity: "U",
    card_type: "Character",
    energy_cost: 3,
    ap_cost: 1,
    bp: 3500,
    trigger_text: null,
    effect_text: "[登場時] テスト",
    image_url:
      "https://www.unionarena-tcg.com/jp/images/cardlist/card/EX01BT_HTR-2-001.png",
    source_url:
      "https://www.unionarena-tcg.com/jp/cardlist/detail.php?card_no=EX01BT%2FHTR-2-001",
    ...overrides,
  };
}

describe("checkUASanity", () => {
  it("passes a clean batch with varied names", () => {
    const cards = Array.from({ length: 50 }, (_, i) =>
      card({
        code: `EX01BT/HTR-1-${String(i + 1).padStart(3, "0")}`,
        name: `テスト${i + 1}`,
      }),
    );
    const r = checkUASanity(cards);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("fails an empty batch", () => {
    const r = checkUASanity([]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].message).toMatch(/no cards/);
  });

  it("fails when most cards lack a name", () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      card({
        code: `EX01BT/HTR-1-${String(i + 1).padStart(3, "0")}`,
        name: i < 50 ? "n" : "",
      }),
    );
    const r = checkUASanity(cards);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.message.includes("name"))).toBeTruthy();
  });

  it("fails when most cards lack a series", () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      card({
        code: `EX01BT/HTR-1-${String(i + 1).padStart(3, "0")}`,
        name: `t${i}`,
        series: i < 10 ? "HUNTER×HUNTER" : "",
      }),
    );
    const r = checkUASanity(cards);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.message.includes("series"))).toBeTruthy();
  });

  it("fails when image_url isn't absolute https", () => {
    const cards = [
      card({ code: "X/1" }),
      card({ code: "X/2", image_url: "/jp/images/x.png" }),
    ];
    const r = checkUASanity(cards);
    expect(r.ok).toBe(false);
  });

  it("fails on duplicate codes (dedupe regression)", () => {
    const r = checkUASanity([card({ code: "X/1" }), card({ code: "X/1" })]);
    expect(r.ok).toBe(false);
  });

  it("accepts Action Point cards with blank rarity and Unknown color", () => {
    // Mix: 20 normal cards + 5 AP cards (blank rarity, Unknown color).
    const normals = Array.from({ length: 20 }, (_, i) =>
      card({
        code: `EX01BT/HTR-2-${String(i + 1).padStart(3, "0")}`,
        name: `n${i}`,
      }),
    );
    const aps = Array.from({ length: 5 }, (_, i) =>
      card({
        code: `EX01BT/HTR-2-AP${i}`,
        name: `AP${i}`,
        card_type: "Action Point",
        rarity: "",
        color: "Unknown",
        energy_cost: 0,
        ap_cost: 0,
        bp: 0,
      }),
    );
    const r = checkUASanity([...normals, ...aps]);
    expect(r.ok).toBe(true);
  });

  it("fails when 100% of non-AP cards have blank rarity (full selector breakage)", () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card({
        code: `EX01BT/HTR-2-${String(i + 1).padStart(3, "0")}`,
        name: `n${i}`,
        rarity: "",
      }),
    );
    const r = checkUASanity(cards);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.message.includes("blank rarity"))).toBeTruthy();
  });

  it("warns when many Character cards have BP=0", () => {
    const cards = Array.from({ length: 30 }, (_, i) =>
      card({
        code: `EX01BT/HTR-2-${String(i + 1).padStart(3, "0")}`,
        name: `n${i}`,
        bp: i < 10 ? 0 : 3000,
      }),
    );
    const r = checkUASanity(cards);
    expect(r.ok).toBe(true); // warn, not error
    expect(r.issues.find((i) => i.message.includes("BP=0"))).toBeTruthy();
  });

  it("warns on unrecognized card_type cluster", () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      card({
        code: `EX01BT/HTR-2-${String(i + 1).padStart(3, "0")}`,
        name: `n${i}`,
        card_type: i < 5 ? "Vehicle" : "Character",
      }),
    );
    const r = checkUASanity(cards);
    expect(r.ok).toBe(true);
    expect(r.issues.find((i) => i.message.includes("unrecognized"))).toBeTruthy();
  });
});
