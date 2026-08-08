/**
 * iOS zooms the page when you focus a text field whose font is under 16px,
 * and leaves you scrolled somewhere else. The zoom itself can't be observed
 * here — it's a native Safari behaviour, not something the DOM reports — but
 * its one trigger can be, so that's what these assert.
 */
import { expect, test } from "@playwright/test";

// Playwright's `hasTouch` is what makes `(pointer: coarse)` match.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const PAGES = ["/digimon", "/digimon/decks", "/digimon/collection"];

for (const url of PAGES) {
  test(`${url}: no text field under 16px`, async ({ page }) => {
    await page.goto(url);
    await page.waitForTimeout(1500);

    const small = await page.evaluate(() => {
      const out: string[] = [];
      const fields = document.querySelectorAll(
        "input, textarea, select, [contenteditable]",
      );
      for (const el of fields) {
        const t = (el as HTMLInputElement).type;
        if (["checkbox", "radio", "color", "hidden", "submit"].includes(t)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 16) {
          out.push(`${el.tagName.toLowerCase()}${t ? `[${t}]` : ""} = ${size}px`);
        }
      }
      return out;
    });

    expect(small, `会触发 iOS 缩放的字段: ${small.join(", ")}`).toEqual([]);
  });
}

test("pinch-zoom is still allowed", async ({ page }) => {
  // The other way to stop the zoom is maximum-scale=1, which disables
  // pinch-zoom for everyone. Make sure nobody reaches for it later.
  await page.goto("/digimon");
  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(content).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);
});
