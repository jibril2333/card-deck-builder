/**
 * Card grids on a phone.
 *
 * The auto-fill sizing fits two 150px tiles across a 390px screen, so a
 * 50-card deck was 25 rows of scrolling and a page of results showed eight
 * cards. Every card grid goes to four across below `sm`.
 */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("four cards to a row, captions sized to match", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("GRID " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  // Put some cards in it.
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  for (const name of ["Omnimon", "MetalGreymon", "Monodramon", "Yokomon"]) {
    await page.getByPlaceholder("搜卡加入卡组…").fill(name);
    const add = page.getByLabel(`加入卡组 ${name}`);
    await add.waitFor();
    await add.click();
    await page.waitForTimeout(400);
  }
  await page.goto(page.url().replace(/\?.*$/, ""));
  await page.waitForTimeout(1500);

  const grid = page.locator(".card-grid");
  await expect(grid).toBeVisible();

  const r = await grid.evaluate((g) => {
    const kids = [...g.children];
    const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
    const size = (sel: string) => {
      const el = g.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    };
    return {
      perRow: tops.filter((t) => t === tops[0]).length,
      tile: Math.round(kids[0].getBoundingClientRect().width),
      name: size(".card-name"),
    };
  });

  expect(r.perRow).toBe(4);
  // The caption has to shrink with the tile: at the shared size the name is
  // nearly a third of an 85px card's width and truncates anyway.
  expect(r.name).toBeLessThan(12);
  expect(r.tile).toBeLessThan(100);
});

for (const url of ["/digimon", "/digimon/collection", "/digimon/decks"]) {
  test(`${url}: four to a row too`, async ({ page }) => {
    await page.goto(url);
    await page.waitForTimeout(2000);
    const grid = page.locator(".card-grid").first();
    if ((await grid.count()) === 0) test.skip();
    const r = await grid.evaluate((g) => {
      const kids = [...g.children];
      const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
      return {
        count: kids.length,
        perRow: tops.filter((t) => t === tops[0]).length,
        // Nothing may overflow its tile — the caption is the likeliest, being
        // the only part with a text minimum.
        overflow: kids.some((k) => k.scrollWidth > k.clientWidth + 1),
      };
    });
    // A row can only hold as many as exist: this fixture's deck list may have
    // fewer than four in it, and that isn't a layout failure.
    expect(r.perRow).toBe(Math.min(4, r.count));
    expect(r.overflow).toBe(false);
  });
}
