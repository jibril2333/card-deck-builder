/**
 * The last row of the card browser is never half empty.
 *
 * Both paginated pages show 60 cards, and the grid used to be
 * `auto-fill minmax(150px, 1fr)` — free to make as many columns as fit, so a
 * wide window got 7 or 8 of them and the page ended on four blank cells that
 * read as cards that failed to load.
 *
 * 60 is divisible by every count from 1 to 6, so the fix is a cap: the 16% in
 * the track's clamp (100/16 = 6.25). This checks the invariant rather than the
 * CSS — what matters is that the arithmetic works out at every width.
 */
import { expect, test } from "@playwright/test";

for (const width of [2560, 1900, 1600, 1280, 1024, 900, 700]) {
  test(`no gaps in the last row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/digimon");
    const grid = page.locator(".card-grid");
    await expect(grid.locator("> *").first()).toBeVisible();

    const cols = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(cols, `${width}px → ${cols} columns`).toBeLessThanOrEqual(6);
    expect(60 % cols, `60 cards over ${cols} columns`).toBe(0);
  });
}
