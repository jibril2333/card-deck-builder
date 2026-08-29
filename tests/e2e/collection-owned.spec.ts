/**
 * The collection page lists every card so you can tick off what turns up in
 * the post. This is the filter that turns it back into a view of the shelf —
 * or of the holes in it.
 *
 * Ownership is per printing, and the page expands alt arts, so the counts
 * below are counts of PRINTINGS, not of cards.
 */
import { expect, test } from "@playwright/test";

const tiles = (p: import("@playwright/test").Page) => p.locator(".card-grid > div");
const badges = (p: import("@playwright/test").Page) => p.locator(".card-grid span", { hasText: /^×\d+$/ });

async function totalShown(p: import("@playwright/test").Page) {
  // The pager line, not the "已收集 N 种 · 共 M 张" header above it.
  const text = (
    await p.getByText(/第 \d+ \/ \d+ 页 · 共 [\d,]+ 张/).innerText()
  ).replace(/,/g, "");
  return Number(/共 (\d+) 张/.exec(text)![1]);
}

test("shows only what you own, or only what you don't", async ({ page }) => {
  await page.goto("/digimon/collection");
  const everything = await totalShown(page);
  expect(everything).toBeGreaterThan(2);

  // Own two printings, starting from a collection with nothing in it.
  await expect(badges(page)).toHaveCount(0);
  for (const i of [0, 1]) {
    await tiles(page).nth(i).getByTitle("+1").click();
    await expect(tiles(page).nth(i).locator("span", { hasText: /^×1$/ })).toBeVisible();
  }

  const owned = page.getByLabel("拥有");
  await owned.selectOption("1");
  await expect(page.getByText("拥有:")).toBeVisible();
  await expect(tiles(page)).toHaveCount(2);
  await expect(badges(page)).toHaveCount(2);
  expect(await totalShown(page)).toBe(2);

  // The other side of the same line: everything still missing.
  await owned.selectOption("0");
  await expect(badges(page)).toHaveCount(0);
  expect(await totalShown(page)).toBe(everything - 2);

  // And the filter composes with the rest of them rather than replacing the
  // query — a colour that neither owned card has leaves nothing behind.
  await owned.selectOption("1");
  // Wait for the page to swap back before reading a tile off it — mid-flight,
  // `first()` is still one of the cards you do NOT own.
  await expect(tiles(page)).toHaveCount(2);
  const href = await tiles(page).first().locator("a").first().getAttribute("href");
  const code = decodeURIComponent(href!.split("/").pop()!.split("?")[0]);
  await page.getByPlaceholder("名称 / 编号 · 空格分词").fill(code);
  await expect(tiles(page)).toHaveCount(1);
  expect(await totalShown(page)).toBe(1);
});
