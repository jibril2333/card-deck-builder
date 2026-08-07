/**
 * Coming back from a deck should land where you left, not at the top.
 *
 * The "← 全部卡组" link was a plain <Link>, i.e. a forward navigation to the
 * same URL, and the router scrolls those to the top by design — so opening a
 * deck from halfway down the list cost you your place. The browser's own back
 * button had been restoring it correctly the whole time.
 */
import { expect, test } from "@playwright/test";

test("returning from a deck lands where you left", async ({ page }) => {
  // Enough decks that the list actually scrolls.
  await page.goto("/digimon/decks");
  for (let i = 0; i < 12; i++) {
    await page.getByPlaceholder("卡组名").fill(`SCROLL ${i} ${Date.now()}`);
    await page.getByRole("button", { name: /创建/ }).click();
    await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
    await page.goto("/digimon/decks");
  }
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto("/digimon/decks");
  await page.waitForTimeout(1500);

  const tiles = page.locator('a[href^="/digimon/decks/"]');
  const n = await tiles.count();
  expect(n).toBeGreaterThan(8);

  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(400);

  // Click a tile that is ALREADY in view. Clicking one that isn't makes
  // Playwright scroll to it first, so the position we left from wouldn't be
  // the one we recorded — which is a broken test, not a broken feature.
  const idx = await tiles.evaluateAll((els) =>
    els.findIndex((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    }),
  );
  expect(idx).toBeGreaterThanOrEqual(0);
  const target = tiles.nth(idx);
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(300);

  await target.click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.waitForTimeout(1200);
  // How you actually get back: the "← 全部卡组" link on the deck page.
  await page.getByRole("link", { name: /全部卡组/ }).click();
  await page.waitForURL(/\/digimon\/decks$/);
  await page.waitForTimeout(2000);

  const after = await page.evaluate(() => window.scrollY);
  console.log(`[scroll] 离开前 ${before} → 返回后 ${after}`);
  expect(Math.abs(after - before)).toBeLessThan(80);
});

test("the back link still works with no history behind it", async ({ page }) => {
  // A deck opened as the first page in the tab — a shared link, a bookmark —
  // has nothing to go back to, so the link has to fall back to a real
  // navigation rather than doing nothing.
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("DIRECT " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  const deckUrl = page.url();

  const fresh = await page.context().newPage();
  await fresh.goto(deckUrl);
  await fresh.getByRole("link", { name: /全部卡组/ }).click();
  await fresh.waitForURL(/\/digimon\/decks$/);
  await expect(fresh.getByRole("heading", { name: /我的卡组/ }).first()).toBeVisible();
  await fresh.close();
});
