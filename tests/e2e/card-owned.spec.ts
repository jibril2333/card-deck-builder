/**
 * The card page says how many copies of it you have, and takes you to the
 * place where that can be changed.
 */
import { expect, test } from "@playwright/test";

const CARD = "BT2-030"; // untouched by the other specs in this run

test("the card page shows what you own", async ({ page }) => {
  await page.goto(`/digimon/card/${CARD}`);
  const owned = page.getByRole("link", { name: /📦/ });
  await expect(owned).toHaveText("📦 0 张");

  await page.goto(`/digimon/collection?q=${CARD}`);
  const tile = page.locator(".card-grid > div").first();
  await tile.locator("input[type=number]").fill("3");
  await tile.locator("input[type=number]").blur();
  await expect(tile.locator("span", { hasText: /^×3$/ })).toBeVisible();

  await page.goto(`/digimon/card/${CARD}`);
  await expect(owned).toHaveText("📦 3 张");

  // And it is the way back to the shelf, filtered to this card — where
  // putting the count back to zero returns the page to its first state. That
  // also leaves the shared fixture as this spec found it: the collection
  // specs that run after it count every owned card on the page.
  await owned.click();
  await page.waitForURL(new RegExp(`/digimon/collection\\?q=${CARD}`));
  const back = page.locator(".card-grid > div").first();
  await back.locator("input[type=number]").fill("0");
  await back.locator("input[type=number]").blur();
  await expect(back.locator("span", { hasText: /^×\d+$/ })).toHaveCount(0);

  await page.goto(`/digimon/card/${CARD}`);
  await expect(owned).toHaveText("📦 0 张");
});
