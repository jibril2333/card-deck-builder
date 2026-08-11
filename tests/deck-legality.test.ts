import { describe, it, expect } from "vitest";
import { DECK_TARGET, deckIsComplete, deckCountBadge } from "@/lib/deck-legality";

describe("deckIsComplete", () => {
  it("wants the main deck at exactly 50", () => {
    expect(deckIsComplete({ main: 50, egg: 0 })).toBe(true);
    expect(deckIsComplete({ main: 49, egg: 0 })).toBe(false);
    // 51 is as unplayable as 49 — "at least 50" would pass this.
    expect(deckIsComplete({ main: 51, egg: 0 })).toBe(false);
  });

  it("treats an empty egg deck as finished, not short", () => {
    expect(deckIsComplete({ main: 50, egg: 0 })).toBe(true);
    expect(deckIsComplete({ main: 50, egg: DECK_TARGET.egg })).toBe(true);
  });

  it("still flags an over-full egg deck", () => {
    expect(deckIsComplete({ main: 50, egg: DECK_TARGET.egg + 1 })).toBe(false);
  });
});

describe("deckCountBadge", () => {
  it("says nothing once the deck is legal", () => {
    expect(deckCountBadge({ main: 50, egg: 5 })).toBeNull();
    expect(deckCountBadge({ main: 50, egg: 0 })).toBeNull();
  });

  it("shows both halves while it isn't, even when only one is wrong", () => {
    // A bare "42" leaves you wondering whether the eggs are counted in it.
    expect(deckCountBadge({ main: 42, egg: 3 })).toBe("42/3");
    expect(deckCountBadge({ main: 50, egg: 6 })).toBe("50/6");
    expect(deckCountBadge({ main: 0, egg: 0 })).toBe("0/0");
  });
});
