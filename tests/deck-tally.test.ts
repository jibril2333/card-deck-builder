import { describe, it, expect } from "vitest";
import { tallyColors, tallyLevels, MULTI_COLOR } from "@/lib/deck-tally";

describe("tallyColors", () => {
  it("counts a card for BOTH of its colours", () => {
    // The old behaviour read only `color`, so a red/black card made a
    // red/black deck look mono-red.
    const bars = tallyColors([{ color: "Red", color2: "Black", quantity: 4 }]);
    expect(bars).toEqual([
      { label: "Black", value: 4 },
      { label: "Red", value: 4 },
      { label: MULTI_COLOR, value: 4 },
    ]);
  });

  it("treats an empty-string color2 as single-colour", () => {
    // Most single-colour rows carry "" rather than NULL.
    const bars = tallyColors([{ color: "Blue", color2: "", quantity: 3 }]);
    expect(bars).toEqual([{ label: "Blue", value: 3 }]);
  });

  it("does not double-count a card whose two colours are the same", () => {
    const bars = tallyColors([{ color: "Green", color2: "Green", quantity: 2 }]);
    expect(bars).toEqual([{ label: "Green", value: 2 }]);
  });

  it("adds 多色 on top of the per-colour numbers, and puts it last", () => {
    const bars = tallyColors([
      { color: "Red", color2: null, quantity: 10 },
      { color: "Red", color2: "Blue", quantity: 2 },
      { color: "Blue", color2: null, quantity: 1 },
    ]);
    expect(bars).toEqual([
      { label: "Red", value: 12 },
      { label: "Blue", value: 3 },
      { label: MULTI_COLOR, value: 2 },
    ]);
    // Deliberately more than the 13 cards in the deck.
    expect(bars.reduce((s, b) => s + b.value, 0)).toBe(17);
  });

  it("omits 多色 entirely when nothing is multi-colour", () => {
    const bars = tallyColors([{ color: "White", color2: null, quantity: 1 }]);
    expect(bars.some((b) => b.label === MULTI_COLOR)).toBe(false);
  });

  it("skips cards with no colour at all", () => {
    expect(tallyColors([{ color: null, color2: null, quantity: 4 }])).toEqual([]);
  });
});

describe("tallyLevels", () => {
  it("keeps the empty rungs so a hole in the curve is visible", () => {
    const bars = tallyLevels([
      { level: 3, quantity: 4 },
      { level: 4, quantity: 8 },
      { level: 6, quantity: 6 },
    ]);
    expect(bars).toEqual([
      { label: "Lv.2", value: 0 },
      { label: "Lv.3", value: 4 },
      { label: "Lv.4", value: 8 },
      { label: "Lv.5", value: 0 },
      { label: "Lv.6", value: 6 },
      { label: "Lv.7", value: 0 },
    ]);
  });

  it("ignores cards with no level", () => {
    const bars = tallyLevels([
      { level: null, quantity: 4 },
      { level: 5, quantity: 2 },
    ]);
    expect(bars.find((b) => b.label === "Lv.5")?.value).toBe(2);
    expect(bars).toHaveLength(6);
  });

  it("returns nothing when the deck has no levelled cards", () => {
    // A Tamer/Option-only deck shouldn't get a panel of six zeros.
    expect(tallyLevels([{ level: null, quantity: 4 }])).toEqual([]);
  });

  it("keeps an unexpected level rather than dropping it", () => {
    const bars = tallyLevels([{ level: 9, quantity: 1 }]);
    expect(bars.map((b) => b.label)).toEqual([
      "Lv.2", "Lv.3", "Lv.4", "Lv.5", "Lv.6", "Lv.7", "Lv.9",
    ]);
  });
});
