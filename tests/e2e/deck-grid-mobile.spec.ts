/**
 * Card grids on a phone.
 *
 * The auto-fill sizing fits two 150px tiles across a 390px screen, so a
 * 50-card deck was 25 rows of scrolling and a page of results showed eight
 * cards. Every card grid goes to four across below `sm`.
 */
import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

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
        // The GRID may not overflow, and neither may the page.
        //
        // This used to ask whether any TILE overflowed its own box, which is
        // a question about font metrics, not about layout: the caption is
        // `truncate`, so its scrollWidth is larger than its clientWidth
        // whenever the name is long — true on a CI runner with different
        // fonts, false on the author's Mac. What actually breaks a phone
        // layout is a column that content has forced wider than its share,
        // and that shows up here.
        overflow:
          g.scrollWidth > g.clientWidth + 1 ||
          document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    // A row can only hold as many as exist: this fixture's deck list may have
    // fewer than four in it, and that isn't a layout failure.
    expect(r.perRow).toBe(Math.min(4, r.count));
    expect(r.overflow).toBe(false);
  });
}

/**
 * The banlist is the one card page that doesn't use `.card-grid` — it has its
 * own column counts because desktop wants bigger tiles there. So it gets its
 * own check that the phone still shows four across, in both of its grids and
 * for the lone trigger card that sits outside them.
 */
test("banlist: four to a row, trigger card included", async ({ page }) => {
  await page.goto("/digimon/restrictions");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const r = await page.evaluate(() => {
    const rowOf = (el: Element) => {
      const kids = [...el.children];
      const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
      return {
        count: kids.length,
        perRow: tops.filter((t) => t === tops[0]).length,
        overflow: kids.some((k) => k.scrollWidth > k.clientWidth + 1),
      };
    };
    // Only the grids that hold card tiles. The pair section's outer layout is
    // also a grid — A / ⇒ / B in one column on a phone — and counting it as a
    // tile grid reports "1 per row" for something that is not a row of cards.
    const grids = [...document.querySelectorAll("section div.grid")]
      .filter(
        (g) =>
          g.children.length > 0 &&
          [...g.children].every((k) => k.querySelector('[class*="aspect-"]')),
      )
      .map(rowOf);
    // The trigger card is the first cell of the pair row's own grid now, so
    // "the same width as a tile" is measured between two cells of it.
    const pair = [...document.querySelectorAll("section")].find((s) =>
      s.querySelector("h2")?.textContent?.includes("禁卡组合"),
    );
    const cells = [...(pair?.querySelector("div.grid")?.children ?? [])];
    return {
      grids,
      tile: cells[1]?.getBoundingClientRect().width,
      triggerTile: cells[0]?.getBoundingClientRect().width,
    };
  });

  expect(r.grids.length).toBeGreaterThan(0);
  for (const g of r.grids) {
    // A row holds at most what exists — a 2-card banned-pair list isn't a bug.
    expect(g.perRow).toBe(Math.min(4, g.count));
    expect(g.overflow).toBe(false);
  }

  // The trigger card used to take the full screen width, which read as a
  // different page sitting under a grid of four-up tiles. It is now simply
  // the first tile of the same grid.
  expect(r.triggerTile).toBeGreaterThan(0);
  expect(r.triggerTile).toBeLessThanOrEqual((r.tile ?? 0) + 2);
});
