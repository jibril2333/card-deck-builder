/**
 * The banlist follows the card-language switcher — artwork as well as names.
 *
 * The names were already localized and the pictures weren't, which left a
 * Japanese title sitting over English art: the one combination that isn't any
 * language. Asserted on the image HOST, because each language's scans come from
 * a different site, and the host is exactly what a name-only fix leaves alone.
 *
 * The fixture restricts BT1-086 and gives it ja/zh rows (see fixtures/seed.ts);
 * every other seeded restriction points at a code the card table doesn't have,
 * so this is the one tile with real art.
 */
import { expect, test, type Page } from "@playwright/test";

/** The BT1-086 tile's name and image host under the given card language. */
async function tile(page: Page, lang: string) {
  await page.context().clearCookies({ name: "cardLang" });
  await page.context().addCookies([
    { name: "cardLang", value: lang, url: "http://127.0.0.1:3100" },
  ]);
  await page.goto("/digimon/restrictions");
  const el = page.locator("section div.grid > a", { hasText: "BT1-086" }).first();
  await el.waitFor();
  return el.evaluate((t) => ({
    name: (t.querySelector("div.font-medium")?.textContent ?? "").trim(),
    host: new URL((t.querySelector("img") as HTMLImageElement).src).host,
  }));
}

test("banlist art and names both follow the card language", async ({ page }) => {
  const en = await tile(page, "en");
  const ja = await tile(page, "ja");
  const zh = await tile(page, "zh");

  expect(en.name).toBe("Matt Ishida");
  expect(ja.name).toBe("石田ヤマト");
  expect(zh.name).toBe("石田大和");

  // The part a name-only localization gets wrong: all three hosts stay English.
  expect(ja.host).toBe("digimoncard.com");
  expect(zh.host).toBe("source.windoent.com");
  expect(ja.host).not.toBe(en.host);
  expect(zh.host).not.toBe(en.host);
});
