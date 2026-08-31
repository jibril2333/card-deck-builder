/**
 * Searching in kana.
 *
 * Japanese card names are katakana, and an IME hands you hiragana until you
 * convert it — so やまと has to find 石田ヤマト. The query is searched for in
 * both scripts; see lib/kana.
 */
import { expect, test } from "@playwright/test";

const results = (p: import("@playwright/test").Page) =>
  p.locator(".card-grid > div, .card-grid > a");

test("the reading finds a name written in kanji", async ({ page }) => {
  // 石田ヤマト prints いしだ over its kanji, and nothing official carries that
  // — the reading comes off the shop listings the price scraper already
  // fetches, into card_translations.name_kana. Without it, いしだ matches
  // nothing at all.
  await page.goto("/digimon?q=" + encodeURIComponent("いしだ"));
  await expect(results(page)).toHaveCount(1);
  await expect(page.locator(".card-grid")).toContainText("BT1-086");

  await page.goto("/digimon?q=" + encodeURIComponent("イシダヤマト"));
  await expect(results(page)).toHaveCount(1);
});

test("hiragana finds a katakana name", async ({ page }) => {
  // Typed as it comes out of an IME, before conversion.
  await page.goto("/digimon?q=" + encodeURIComponent("やまと"));
  await expect(results(page)).toHaveCount(1);
  await expect(page.locator(".card-grid")).toContainText("BT1-086");

  // And the converted form still works, as it always did.
  await page.goto("/digimon?q=" + encodeURIComponent("ヤマト"));
  await expect(results(page)).toHaveCount(1);
  await expect(page.locator(".card-grid")).toContainText("BT1-086");
});

test("the build-mode picker takes kana too", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("KANA " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);
  await page.getByRole("link", { name: /🛠 组建/ }).click();

  await page.getByPlaceholder("搜卡加入卡组…").fill("やまと");
  await expect(page.getByLabel(/^加入卡组 /)).toHaveCount(1);
});
