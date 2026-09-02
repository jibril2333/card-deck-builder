import { describe, expect, it } from "vitest";
import { computeDeckDiff } from "@/components/deck-diff";

const c = (code: string, quantity: number) => ({
  code,
  name: code,
  image_url: null,
  quantity,
});

describe("computeDeckDiff", () => {
  it("splits a pair of decks into only-A / only-B / different-count", () => {
    const d = computeDeckDiff(
      [c("BT1-021", 4), c("BT1-050", 2), c("BT1-085", 1)],
      [c("BT1-021", 2), c("BT1-086", 3), c("BT1-085", 1)],
    );
    expect(d.onlyA.map((x) => x.code)).toEqual(["BT1-050"]);
    expect(d.onlyB.map((x) => x.code)).toEqual(["BT1-086"]);
    expect(d.diffQty).toEqual([
      expect.objectContaining({ code: "BT1-021", quantity: 4, qtyB: 2 }),
    ]);
    // Same card, same count: counted, not listed.
    expect(d.sameKinds).toBe(1);
  });

  it("reports nothing to show when the lists match", () => {
    const same = [c("BT1-021", 4), c("BT1-050", 1)];
    const d = computeDeckDiff(same, [...same]);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
    expect(d.diffQty).toEqual([]);
    expect(d.sameKinds).toBe(2);
  });

  it("treats an alt-art print as its own card", () => {
    // Deliberate: a deck listing BT1-009_p1 is a different physical list from
    // one listing BT1-009, even though the two play identically.
    const d = computeDeckDiff([c("BT1-009", 1)], [c("BT1-009_p1", 1)]);
    expect(d.onlyA.map((x) => x.code)).toEqual(["BT1-009"]);
    expect(d.onlyB.map((x) => x.code)).toEqual(["BT1-009_p1"]);
    expect(d.sameKinds).toBe(0);
  });

  it("sorts each bucket by code so the columns line up run to run", () => {
    const d = computeDeckDiff(
      [c("BT1-085", 1), c("BT1-021", 1), c("BT1-050", 1)],
      [],
    );
    expect(d.onlyA.map((x) => x.code)).toEqual([
      "BT1-021",
      "BT1-050",
      "BT1-085",
    ]);
  });
});
