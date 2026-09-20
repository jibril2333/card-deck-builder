/**
 * The site's language — one switch for the interface and the cards.
 *
 * Three things have to hold, and each of them is invisible to the person who
 * wrote the page in their own language:
 *
 *  · a reader who has chosen nothing gets their browser's language, and
 *    something readable when the site has no dictionary for it;
 *  · the switch changes the WORDS, not only the card text, and the choice
 *    survives navigation;
 *  · `<html lang>` follows, because Chinese and Japanese share code points
 *    and the browser picks the glyphs from that attribute.
 *
 * The rest of the suite runs in Chinese (playwright.config sets the browser's
 * language), so this file is where the other two are exercised at all.
 */

import { expect, test } from "@playwright/test";

test.describe("with no choice made, the browser decides", () => {
  test.use({ locale: "ja-JP" });

  test("a Japanese browser gets the Japanese site", async ({ page }) => {
    await page.goto("/digimon/decks");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(
      page.getByRole("link", { name: "カード検索" }),
    ).toBeVisible();
    // The card language moves with it: the fixture's BT1-086 has a Japanese
    // name, and the Chinese one must not be what shows.
    await page.goto("/digimon?q=BT1-086");
    await expect(page.getByText("石田ヤマト")).toBeVisible();
    await expect(page.getByText("石田大和")).toHaveCount(0);
  });
});

test.describe("a language the site does not have", () => {
  test.use({ locale: "de-DE" });

  test("falls back to Chinese rather than to nothing", async ({ page }) => {
    await page.goto("/digimon/decks");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
    await expect(page.getByRole("link", { name: "卡牌检索" })).toBeVisible();
  });
});

test.describe("the switch", () => {
  test.use({ locale: "en-US" });

  test("changes the whole site, and is remembered", async ({ page }) => {
    await page.goto("/digimon/decks");
    // en-US browser, nothing chosen: the English site.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "My decks" })).toBeVisible();

    // Pick 中 from the sidebar's EN / 中 / 日.
    await page.getByRole("button", { name: "中", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
    await expect(page.getByRole("link", { name: "我的卡组" })).toBeVisible();

    // The choice beats the browser's own language on the next page too.
    await page.goto("/digimon");
    await expect(page.getByRole("heading", { name: /卡牌检索/ })).toBeVisible();

    // And 日 switches both halves again — interface and card text.
    await page.getByRole("button", { name: "日", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await page.goto("/digimon?q=BT1-086");
    await expect(page.getByText("石田ヤマト")).toBeVisible();
  });
});
