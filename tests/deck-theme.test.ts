import { describe, expect, it } from "vitest";
import { accentFrom, deckThemeCss } from "@/lib/deck-theme";

/**
 * The deck's colour reaches a <style> tag straight out of the database, and it
 * was put there by a colour input — so what matters is that nothing but a hex
 * survives, and that whatever does survive is still visible on the canvas.
 */
describe("accentFrom", () => {
  it("keeps the hue and pulls lightness into the legible band", () => {
    // Near-black: same hue, lifted to the floor of the band.
    const dark = accentFrom("#111827")!;
    expect(dark).toMatch(/^hsl\(2\d\d /);
    const l = Number(/([\d.]+)%\)$/.exec(dark)![1]);
    expect(l).toBeGreaterThanOrEqual(55);
    // Near-white: pulled down to the ceiling.
    const light = Number(/([\d.]+)%\)$/.exec(accentFrom("#fefefe")!)![1]);
    expect(light).toBeLessThanOrEqual(78);
  });

  it("leaves a colour that's already in range alone", () => {
    // #3b82f6 is L 59.8%, inside the band — it comes out untouched.
    expect(accentFrom("#3b82f6")).toBe("hsl(217 91.2% 59.8%)");
    // #f59e0b is L 50.2%, just under the floor, so it is lifted to it.
    expect(accentFrom("#f59e0b")).toBe("hsl(38 92.1% 55%)");
  });

  it("lets a grey deck stay grey", () => {
    const grey = accentFrom("#808080")!;
    expect(grey).toMatch(/^hsl\(0 0% /);
  });

  it("refuses anything that isn't a plain hex", () => {
    for (const bad of [
      "red",
      "#f0f",
      "#12345",
      "#1234567",
      "rgb(1,2,3)",
      "#fff;}body{display:none}",
      "",
    ]) {
      expect(accentFrom(bad)).toBeNull();
      expect(deckThemeCss(bad, null)).toBeNull();
    }
  });
});

describe("deckThemeCss", () => {
  it("paints accent2 only when the deck has a second colour", () => {
    expect(deckThemeCss("#f59e0b", null)).not.toContain("--color-accent2");
    expect(deckThemeCss("#f59e0b", "#3b82f6")).toContain("--color-accent2:");
  });

  it("never emits anything that could close the declaration", () => {
    const css = deckThemeCss("#3b82f6", "#f59e0b")!;
    expect(css.match(/[{}]/g)).toEqual(["{", "}"]);
    expect(css).not.toContain("<");
  });
});
