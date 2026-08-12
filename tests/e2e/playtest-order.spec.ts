/**
 * The playtest probability table lists cards in the deck's own order.
 *
 * It used to sort by copy count, so the same deck read top-to-bottom in two
 * different orders depending on which page you had open — and the row you were
 * aiming at on the deck page was somewhere else here.
 *
 * Compared as sequences rather than as sets: a set comparison passes for any
 * ordering, which is the one thing this test exists to catch.
 */
import { expect, test, type Page } from "@playwright/test";

/** Card codes in the order the deck page renders them. */
async function deckOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".card-grid .card-code")].map((e) =>
      (e.textContent ?? "").trim(),
    ),
  );
}

/** Card codes in the order the playtest table lists them. */
async function playtestOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("tbody tr td:nth-child(2) span.font-mono")].map(
      (e) => (e.textContent ?? "").trim(),
    ),
  );
}

test("playtest lists cards in the same order as the deck", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(`ORDER ${Date.now()}`);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  const deckUrl = page.url();

  // A spread of levels and copy counts, added in an order that matches neither
  // the deck's (level, code) nor a count-descending one — so a table that
  // re-sorts can't accidentally agree.
  await page.getByRole("link", { name: /🛠 组建/ }).click();
  for (const [name, extra] of [
    ["Omnimon", 2],
    ["Yokomon", 0],
    ["MetalGreymon", 3],
    ["Monodramon", 1],
  ] as const) {
    await page.getByPlaceholder("搜卡加入卡组…").fill(name);
    const add = page.getByLabel(`加入卡组 ${name}`);
    await add.waitFor();
    for (let i = 0; i <= extra; i++) {
      await add.click();
      await page.waitForTimeout(300);
    }
  }

  await page.goto(deckUrl);
  await page.waitForTimeout(1200);
  const deck = await deckOrder(page);
  expect(deck.length).toBeGreaterThan(2);

  await page.goto(`${deckUrl}/playtest`);
  await page.waitForTimeout(1200);
  const playtest = await playtestOrder(page);

  // Digi-Eggs are in the deck but never drawn, so the playtest table leaves
  // them out; what's left has to appear in the same relative order.
  const expected = deck.filter((code) => playtest.includes(code));
  expect(playtest).toEqual(expected);
  expect(playtest.length).toBeGreaterThan(1);
});
