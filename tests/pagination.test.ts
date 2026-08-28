import { describe, expect, it } from "vitest";
import { pageWindow } from "@/components/pagination";

/**
 * The card list runs to ~73 pages, so this control is the only way to reach
 * the middle of it. Two things have to hold, and both are easy to get wrong
 * by one: every page is reachable in the shape it claims, and the control
 * doesn't change width as you walk through it — buttons that move under the
 * cursor are worse than no numbers at all.
 */
const nums = (w: (number | null)[]) => w.filter((p): p is number => p !== null);

describe("pageWindow", () => {
  it("lists every page when they all fit", () => {
    for (const total of [1, 2, 5, 6, 7]) {
      const w = pageWindow(1, total);
      expect(w).toEqual(Array.from({ length: total }, (_, i) => i + 1));
      expect(w).not.toContain(null);
    }
  });

  it("always offers the first and last page", () => {
    for (const page of [1, 2, 8, 40, 72, 73]) {
      const w = pageWindow(page, 73);
      expect(w[0]).toBe(1);
      expect(w[w.length - 1]).toBe(73);
    }
  });

  it("keeps one width at every position", () => {
    // Including the ends: anchoring the run rather than centring it is the
    // whole reason page 1 and page 40 render the same number of buttons.
    const widths = new Set<number>();
    for (let page = 1; page <= 73; page++) {
      widths.add(pageWindow(page, 73).length);
    }
    expect([...widths]).toHaveLength(1);
  });

  it("includes the current page, always", () => {
    for (let page = 1; page <= 73; page++) {
      expect(nums(pageWindow(page, 73))).toContain(page);
    }
  });

  it("is strictly ascending with no repeats", () => {
    for (const page of [1, 3, 40, 71, 73]) {
      const n = nums(pageWindow(page, 73));
      expect(n).toEqual([...new Set(n)]);
      expect(n).toEqual([...n].sort((a, b) => a - b));
    }
  });

  it("only puts a gap where pages were actually skipped", () => {
    for (let page = 1; page <= 73; page++) {
      const w = pageWindow(page, 73);
      w.forEach((p, i) => {
        if (p !== null) return;
        const before = w[i - 1] as number;
        const after = w[i + 1] as number;
        // A "…" standing in for a single page would be a lie and a wasted slot.
        expect(after - before).toBeGreaterThan(1);
      });
    }
  });

  it("anchors the run at whichever end you are near", () => {
    expect(pageWindow(1, 73).slice(0, 6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pageWindow(73, 73).slice(-6)).toEqual([68, 69, 70, 71, 72, 73]);
  });
});

/**
 * The phone form. It is the same function with a shorter run — the point of
 * the parameter is that everything above still holds, on a control that fits
 * a 360px screen with the arrows stripped down to their glyphs.
 */
describe("pageWindow, narrow", () => {
  it("keeps one width at every position", () => {
    const widths = new Set<number>();
    for (let page = 1; page <= 73; page++) widths.add(pageWindow(page, 73, 5).length);
    expect([...widths]).toEqual([7]);
  });

  it("still shows the current page, its neighbours, and both ends", () => {
    for (let page = 2; page <= 72; page++) {
      const n = nums(pageWindow(page, 73, 5));
      expect(n).toContain(page);
      expect(n).toContain(page - 1);
      expect(n).toContain(page + 1);
      expect(n[0]).toBe(1);
      expect(n[n.length - 1]).toBe(73);
    }
  });

  it("is shorter than the desktop window wherever there is a gap to hide", () => {
    expect(pageWindow(40, 73, 5).length).toBeLessThan(pageWindow(40, 73).length);
  });
});
