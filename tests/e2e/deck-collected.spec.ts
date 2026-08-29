/**
 * What the shelf holds, shown while building.
 *
 * Deciding whether a deck is buildable meant leaving it for the collection
 * page and back once per card. The tile now carries "📦 owned/wanted", and
 * the picker says how many you have before you add the card at all.
 */
import { expect, test } from "@playwright/test";

const CARD = "BT1-084"; // Omnimon — no other spec touches this one.

test("a deck tile says how many copies you own", async ({ page }) => {
  // Exactly two copies on the shelf. Set, not incremented: the fixture DB is
  // shared with every other spec in the run, and one of them collects cards.
  await page.goto(`/digimon/collection?q=${CARD}`);
  const tile = page.locator(".card-grid > div").first();
  await tile.locator("input[type=number]").fill("2");
  await tile.locator("input[type=number]").blur();
  await expect(tile.locator("span", { hasText: /^×2$/ })).toBeVisible();

  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("COL " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  // The picker knows before the card is even added.
  await page.getByPlaceholder("搜卡加入卡组…").fill(CARD);
  const hit = page.getByLabel(/^加入卡组 /).first();
  await expect(page.getByTitle("已收集 2 张")).toBeVisible();

  // One copy in the deck, two on the shelf: no shortfall.
  await hit.click();
  const deckTile = page.locator(".card-grid > div").first();
  await expect(deckTile.getByTitle("已收集 2 张 · 这套需要 1 张")).toHaveText("📦 2/1");

  // Ask for four and the badge turns amber — the tile now says what is short.
  for (let i = 0; i < 3; i++) await hit.click();
  const badge = deckTile.getByTitle("已收集 2 张 · 这套需要 4 张");
  await expect(badge).toHaveText("📦 2/4");
  await expect(badge).toHaveClass(/amber/);
});
