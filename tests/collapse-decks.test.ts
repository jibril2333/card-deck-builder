import { describe, it, expect } from "vitest";
import { collapseDecks, COLLAPSE_ABOVE } from "@/lib/collapse-decks";

const decks = (qtys: number[]) => qtys.map((card_qty, i) => ({ card_qty, id: i }));

describe("collapseDecks", () => {
  it("offers no toggle for a list that already fits", () => {
    const r = collapseDecks(decks(Array(COLLAPSE_ABOVE).fill(0)), false);
    expect(r.collapsible).toBe(false);
    expect(r.shown).toHaveLength(COLLAPSE_ABOVE);
    expect(r.hidden).toBe(0);
  });

  it("starts folding one deck past the threshold", () => {
    const r = collapseDecks(decks(Array(COLLAPSE_ABOVE + 1).fill(0)), false);
    expect(r.collapsible).toBe(true);
    expect(r.shown).toHaveLength(0);
    expect(r.hidden).toBe(COLLAPSE_ABOVE + 1);
  });

  it("keeps the decks that already hold the card while collapsed", () => {
    const r = collapseDecks(decks([0, 2, 0, 0, 0, 0, 1, 0]), false);
    expect(r.shown.map((d) => d.id)).toEqual([1, 6]);
    expect(r.hidden).toBe(6);
  });

  it("shows everything when expanded, in the caller's order", () => {
    // Deliberately NOT holders-first. Sorting them up meant that adding a copy
    // promoted that deck to the top of the list, moving the row out from under
    // the pointer that just clicked it.
    const r = collapseDecks(decks([0, 2, 0, 0, 0, 0, 1, 0]), true);
    expect(r.shown.map((d) => d.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r.hidden).toBe(0);
  });

  it("ignores `expanded` when there is nothing to fold", () => {
    const short = decks([0, 3, 0]);
    expect(collapseDecks(short, false).shown.map((d) => d.id)).toEqual([0, 1, 2]);
    expect(collapseDecks(short, true).shown.map((d) => d.id)).toEqual([0, 1, 2]);
  });

  it("handles an empty list", () => {
    expect(collapseDecks([], false)).toEqual({ shown: [], hidden: 0, collapsible: false });
  });
});
