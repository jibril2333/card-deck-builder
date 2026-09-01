/**
 * A deck's price before anyone types one.
 *
 * Every card carries two shop quotes at most and a hand-typed price at least
 * as often as never. The cheaper quote is what fills in: shown as the input's
 * placeholder — the value in force until it is typed over — and counted in the
 * deck's total.
 */
import { expect, test } from "@playwright/test";

test("the shop floor stands in until a price is typed", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("PRICE " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  // BT1-084: PAO 180, Cardrush 300 → the placeholder is the cheaper one.
  await page.getByPlaceholder("搜卡加入卡组…").fill("BT1-084");
  await page.getByLabel(/^加入卡组 /).first().click();
  const tile = page.locator(".card-grid > div").first();
  const input = tile.getByTitle(/未填写时按/);
  await expect(input).toHaveAttribute("placeholder", "180");
  await expect(input).toHaveAttribute("title", /PAO/);
  // Empty, not pre-filled: the shop's number is what applies, not a choice
  // anyone made.
  await expect(input).toHaveValue("");

  // And it counts: one copy at the floor price.
  await expect(page.getByText("¥180")).toBeVisible();

  // Typing wins over the shops.
  await input.fill("25");
  await input.blur();
  await expect(page.getByText("¥25")).toBeVisible();
});
