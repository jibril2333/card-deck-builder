/**
 * "← 全部卡组" goes to the deck list. Every time — including the route that
 * broke it: a card page, the deck list, an import, and the new deck. Going
 * back one entry from there is the card page, not the list, and the label
 * does not say "back".
 */
import { expect, test } from "@playwright/test";

test("the deck's back link lands on the deck list after an import", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/digimon");
  await page.locator(".card-grid a").first().click();
  await page.waitForURL(/\/digimon\/card\//);

  await page.getByRole("link", { name: /我的卡组/ }).click();
  await page.waitForURL(/\/digimon\/decks$/);

  await page.evaluate(() => navigator.clipboard.writeText("4 BT1-001\n"));
  await page.getByRole("button", { name: /导入/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i, { timeout: 15_000 });

  await page.getByRole("link", { name: /全部卡组/ }).click();
  await page.waitForURL(/\/digimon\/decks$/);
  await expect(page.getByRole("heading", { level: 1, name: /我的卡组/ })).toBeVisible();
});
