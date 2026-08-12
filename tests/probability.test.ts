import { describe, it, expect } from "vitest";
import { pAtLeastOne, pNone } from "@/lib/probability";

describe("pNone", () => {
  it("is the complement of pAtLeastOne", () => {
    for (const seen of [1, 5, 8, 10]) {
      expect(pNone(50, 4, seen)).toBeCloseTo(1 - pAtLeastOne(50, 4, seen), 12);
    }
  });

  it("matches the hypergeometric worked by hand", () => {
    // 4 copies in 50, opening hand of 5: C(46,5) / C(50,5).
    const expected = (46 * 45 * 44 * 43 * 42) / (50 * 49 * 48 * 47 * 46);
    expect(pNone(50, 4, 5)).toBeCloseTo(expected, 12);
  });

  it("is certain when you play none of them", () => {
    // A level you run zero of cannot show up. `pAtLeastOne` short-circuits to
    // 0 for k=0, so the complement has to land on 1 — not the other way round.
    expect(pNone(50, 0, 5)).toBe(1);
  });

  it("is impossible once enough cards are seen", () => {
    expect(pNone(50, 47, 5)).toBe(0); // pigeonhole: 5 seen, only 3 non-copies
    expect(pNone(50, 1, 50)).toBe(0);
  });

  it("falls monotonically as more cards are seen", () => {
    const seq = [5, 6, 7, 8, 9, 10].map((s) => pNone(50, 4, s));
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeLessThan(seq[i - 1]);
    }
  });

  it("gives the numbers the playtest sidebar shows", () => {
    // A typical curve: 14 Lv.3s in a 50-card deck, opening hand plus 0–5 draws.
    // Values cross-checked against C(50-14, 5+t) / C(50, 5+t) computed
    // independently — my first guess at them was wrong and the code was right.
    const pct = [0, 1, 2, 3, 4, 5].map((t) =>
      Number((pNone(50, 14, 5 + t) * 100).toFixed(1)),
    );
    expect(pct).toEqual([17.8, 12.3, 8.4, 5.6, 3.8, 2.5]);
  });
});
