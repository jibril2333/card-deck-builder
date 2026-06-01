import { describe, expect, it } from "vitest";
import { checkScrapeSanity } from "@/lib/scraper/sanity";
import type { ScrapedCard } from "@/lib/scraper/digimon";

function card(overrides: Partial<ScrapedCard> = {}): ScrapedCard {
  return {
    code: "BT1-001",
    name: "Test Digimon",
    rarity: "C",
    card_type: "Digimon",
    level: 3,
    color: "Red",
    color2: null,
    play_cost: 3,
    dp: 2000,
    attribute: "Vaccine",
    form: "Rookie",
    stage: "Rookie",
    digi_types: "Dragon",
    evolution_cost: null,
    evolution_requirements: null,
    main_effect: null,
    security_effect: null,
    inherited_effect: null,
    source_effect: null,
    set_names: null,
    image_url: "https://world.digimoncard.com/images/cardlist/card/BT1-001.png",
    ...overrides,
  };
}

describe("checkScrapeSanity", () => {
  it("passes a clean batch", () => {
    // Vary names so the "all identical names" warning doesn't trip.
    const cards = Array.from({ length: 50 }, (_, i) =>
      card({
        code: `BT1-${String(i + 1).padStart(3, "0")}`,
        name: `Test Digimon ${i + 1}`,
      }),
    );
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.total).toBe(50);
  });

  it("fails on an empty batch", () => {
    const r = checkScrapeSanity([]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].severity).toBe("error");
    expect(r.issues[0].message).toMatch(/no cards/i);
  });

  it("fails when too many cards have empty names (selector regression)", () => {
    // 100 cards, only 50 named → 50% name ratio, way below 95% threshold
    const cards = Array.from({ length: 100 }, (_, i) =>
      card({
        code: `BT1-${String(i + 1).padStart(3, "0")}`,
        name: i < 50 ? "Test" : "",
      }),
    );
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(false);
    const err = r.issues.find((i) => i.message.includes("non-empty name"));
    expect(err?.severity).toBe("error");
  });

  it("fails when card_type is missing on too many rows", () => {
    const cards = Array.from({ length: 100 }, (_, i) =>
      card({
        code: `BT1-${String(i + 1).padStart(3, "0")}`,
        // Make 5% of cards have no card_type → below 99% threshold
        card_type: i < 5 ? "" : "Digimon",
      }),
    );
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.message.includes("card_type"))).toBeTruthy();
  });

  it("fails when image_url is not absolute https", () => {
    const cards = [
      card({ code: "BT1-001" }),
      card({ code: "BT1-002", image_url: "../images/cardlist/card/BT1-002.png" }),
    ];
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(false);
    expect(
      r.issues.find((i) => i.message.includes("not absolute https")),
    ).toBeTruthy();
  });

  it("fails on duplicate codes (dedupe regression)", () => {
    const cards = [card({ code: "BT1-001" }), card({ code: "BT1-001" })];
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.message.includes("duplicate"))).toBeTruthy();
  });

  it("warns (does not fail) on unrecognized card_type cluster", () => {
    // 10% have an unknown card_type → above 5% warn threshold but no error rule
    const cards = Array.from({ length: 100 }, (_, i) =>
      card({
        code: `BT1-${String(i + 1).padStart(3, "0")}`,
        card_type: i < 10 ? "Mystery" : "Digimon",
      }),
    );
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(true); // warn doesn't fail
    const warn = r.issues.find((i) => i.message.includes("unrecognized"));
    expect(warn?.severity).toBe("warn");
  });

  it("warns on unknown color in palette", () => {
    const cards = [card({ color: "Magenta" })];
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(true);
    expect(r.issues.find((i) => i.severity === "warn")).toBeTruthy();
  });

  it("warns when Digimon-type cards have null level", () => {
    const cards = [
      card({ code: "BT1-001" }),
      card({ code: "BT1-002", card_type: "Digimon", level: null }),
    ];
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(true);
    expect(
      r.issues.find((i) => i.message.includes("null level")),
    ).toBeTruthy();
  });

  it("treats Tamer, Option, Digi-Egg, Dual as recognized types", () => {
    const cards = [
      card({ code: "BT1-001", card_type: "Tamer", level: null }),
      card({ code: "BT1-002", card_type: "Option", level: null }),
      card({ code: "BT1-003", card_type: "Digi-Egg", level: 2 }),
      card({ code: "BT1-004", card_type: "Dual" }),
    ];
    const r = checkScrapeSanity(cards);
    expect(r.ok).toBe(true);
    expect(
      r.issues.find((i) => i.message.includes("unrecognized")),
    ).toBeUndefined();
  });
});
