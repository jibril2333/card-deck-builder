/**
 * The deck grid on a phone.
 *
 * The shared `.card-grid` fits two 150px tiles across a 390px screen, which
 * makes a 50-card deck 25 rows of scrolling. On the deck page you already know
 * what's in it, so the tile only has to be big enough to recognise.
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

  const grid = page.locator(".card-grid-deck");
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

test("the card browser's grid is untouched", async ({ page }) => {
  // Deliberately not changed: there you're reading effect text, which needs
  // the bigger tile.
  await page.goto("/digimon");
  await page.waitForTimeout(1500);
  const perRow = await page.locator(".card-grid").first().evaluate((g) => {
    const tops = [...g.children].map((k) => Math.round(k.getBoundingClientRect().top));
    return tops.filter((t) => t === tops[0]).length;
  });
  expect(perRow).toBeLessThan(4);
});
