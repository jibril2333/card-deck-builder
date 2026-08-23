/**
 * Inside a deck, the app wears the deck's colour.
 *
 * The value reaches a <style> tag out of the database, so what's checked here
 * is both halves: that the accent actually changes on the deck's own pages,
 * and that it goes back to the app's own when you leave — the <style> lives
 * with the page, so a stale colour would mean the element outlived it.
 */
import { expect, test } from "@playwright/test";

const accent = (p: import("@playwright/test").Page) =>
  p.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--color-accent")
      .trim(),
  );

test("the deck's colour becomes the site's, and only while you're in it", async ({
  page,
}) => {
  await page.goto("/digimon/decks");
  const siteAccent = await accent(page);
  expect(siteAccent).toContain("oklch");

  await page.getByPlaceholder("卡组名").fill("THEME " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  const deckUrl = page.url();

  // Set the deck's main colour through its own picker.
  await page.getByLabel("主色").evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, "#16a34a");
  await page.waitForTimeout(1200);
  await page.reload();

  // Green, and clamped into the legible band rather than used raw.
  expect(await accent(page)).toBe("hsl(142 76.2% 55%)");
  // The playtest page is inside the deck too.
  await page.goto(`${deckUrl}/playtest`);
  expect(await accent(page)).toBe("hsl(142 76.2% 55%)");

  // Out of the deck, the app is itself again.
  await page.goto("/digimon/decks");
  expect(await accent(page)).toBe(siteAccent);
});
