import { describe, it, expect } from "vitest";
import {
  buildSetOrder,
  cardSet,
  cardsNewerThan,
  deckVersionOf,
  normalizeSetKey,
  setKeysForCard,
} from "@/lib/deck-version";

/** A slice of the real dropdown, in the real (non-obvious) order. */
const order = buildSetOrder([
  { code: "BT-26", release_order: 72 },
  { code: "EX-12", release_order: 71 },
  { code: "BT-25", release_order: 70 },
  { code: "AD-01", release_order: 69 },
  { code: "EX-11", release_order: 68 },
  { code: "BT-24", release_order: 67 },
  { code: "ST-1", release_order: 32 },
  { code: "LM-01", release_order: 5 },
  { code: "BT-05", release_order: 36 },
]);

describe("normalizeSetKey", () => {
  it("reduces the three spellings of one pack to the same key", () => {
    // digimoncard.com writes BT-26, our English set_names writes [LM01],
    // and the site itself is inconsistent about padding (ST-1 vs ST-01).
    expect(normalizeSetKey("BT-26")).toBe("BT26");
    expect(normalizeSetKey("LM01")).toBe("LM1");
    expect(normalizeSetKey("LM-01")).toBe("LM1");
    expect(normalizeSetKey("ST-1")).toBe("ST1");
    expect(normalizeSetKey("ST-01")).toBe("ST1");
  });

  it("says no to anything without a number", () => {
    // Promos and the merch buckets — they have no position in time.
    expect(normalizeSetKey("P")).toBeNull();
    expect(normalizeSetKey("SPECIAL LIMITED SET")).toBeNull();
    expect(normalizeSetKey("")).toBeNull();
    expect(normalizeSetKey(null)).toBeNull();
  });
});

describe("setKeysForCard", () => {
  it("reads every bracketed product, plus the code's own prefix", () => {
    expect(setKeysForCard("BT5-010", "Booster X [BT-05]; Promo Pack")).toEqual([
      "BT5",
    ]);
    expect(
      setKeysForCard("EX12-017", "Extra Booster [EX-12]"),
    ).toEqual(["EX12"]);
  });

  it("dates an LM card, whose code can't", () => {
    // LM-001's code says "LM" and nothing more; only set_names knows it's the
    // first Limited pack.
    expect(setKeysForCard("LM-001", "LIMITED PACK DIGIMON GHOST GAME [LM01]"))
      .toEqual(["LM1"]);
  });

  it("contributes nothing for a promo", () => {
    expect(setKeysForCard("P-001", "Promotion Pack Ver 0.0")).toEqual([]);
  });
});

describe("cardSet", () => {
  it("dates a card by its EARLIEST printing, not its newest reprint", () => {
    // A BT-05 card reprinted in BT-26 has been playable since BT-05; taking
    // the reprint would date every old deck by its promos.
    const c = { code: "BT5-010", set_names: "Booster [BT-05]; Reprint [BT-26]" };
    expect(cardSet(c, order)?.code).toBe("BT-05");
  });

  it("returns null for a card no pack claims", () => {
    expect(cardSet({ code: "P-001", set_names: "Promotion Pack" }, order)).toBeNull();
  });
});

describe("deckVersionOf", () => {
  it("is the newest pack the deck needs", () => {
    const cards = [
      { code: "BT5-010", set_names: "[BT-05]" },
      { code: "BT24-001", set_names: "[BT-24]" },
      { code: "EX12-017", set_names: "[EX-12]" },
    ];
    expect(deckVersionOf(cards, order)).toBe("EX-12");
  });

  it("follows the official order, not the card code", () => {
    // EX-12 came out AFTER BT-25 — a string compare would say BT-25.
    expect(
      deckVersionOf(
        [
          { code: "BT25-001", set_names: "[BT-25]" },
          { code: "EX12-001", set_names: "[EX-12]" },
        ],
        order,
      ),
    ).toBe("EX-12");
    // …and AD-01 sits between BT-25 and EX-11, which no naming scheme implies.
    expect(
      deckVersionOf(
        [
          { code: "AD1-001", set_names: "[AD-01]" },
          { code: "EX11-001", set_names: "[EX-11]" },
        ],
        order,
      ),
    ).toBe("AD-01");
  });

  it("ignores promos rather than dating the deck by them", () => {
    expect(
      deckVersionOf(
        [
          { code: "P-001", set_names: "Promotion Pack" },
          { code: "BT5-010", set_names: "[BT-05]" },
        ],
        order,
      ),
    ).toBe("BT-05");
  });

  it("is null when nothing can be dated", () => {
    expect(deckVersionOf([{ code: "P-001", set_names: "Promo" }], order)).toBeNull();
    expect(deckVersionOf([], order)).toBeNull();
  });
});

describe("cardsNewerThan", () => {
  const cards = [
    { code: "BT24-001", set_names: "[BT-24]" },
    { code: "BT26-001", set_names: "[BT-26]" },
    { code: "EX12-001", set_names: "[EX-12]" },
  ];

  it("lists what the label doesn't cover yet", () => {
    const out = cardsNewerThan("BT-25", cards, order);
    expect(out.map((c) => c.code).sort()).toEqual(["BT26-001", "EX12-001"]);
  });

  it("finds nothing once the label catches up", () => {
    expect(cardsNewerThan("BT-26", cards, order)).toEqual([]);
  });

  it("claims nothing when the deck has no version, or an unknown one", () => {
    // "No version" is not "the oldest version" — an unset label must not
    // light up every card in the deck.
    expect(cardsNewerThan(null, cards, order)).toEqual([]);
    expect(cardsNewerThan("BT-99", cards, order)).toEqual([]);
  });
});
