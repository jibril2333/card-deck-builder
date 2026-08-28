/**
 * The filters on a phone: a button in the thumb's corner and a bottom sheet.
 *
 * They used to be an inline panel that unfolded above the results and pushed
 * every card off the screen — you filtered, scrolled back, closed it, scrolled
 * down again. The sheet costs no layout: the results stay where they are and
 * are still visible behind it.
 */
import { expect, test } from "@playwright/test";

// File-scope `use` reaches contexts made from the `browser` fixture too, so a
// desktop assertion cannot live in this file — it would still report
// `pointer: coarse`. That half is in desktop-vs-touch.spec.ts.
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

const fab = (p: import("@playwright/test").Page) =>
  p.getByRole("button", { name: "筛选", exact: true });

test("opens over the results and says how many filters are on", async ({
  page,
}) => {
  await page.goto("/digimon?color=Red");
  const cards = page.locator(".card-grid a").first();
  await expect(cards).toBeVisible();

  // Closed: the results start at the top of the page, not below a wall of
  // controls. The first card is above the fold.
  const box = (await cards.boundingBox())!;
  expect(box.y).toBeLessThan(400);

  // The badge counts what is actually filtered — it used to be the number of
  // chip definitions, i.e. "15" forever.
  await expect(fab(page)).toContainText("1");
  // And the desktop's collapse bar is not also here.
  await expect(page.getByRole("button", { name: /🔍 筛选/ })).toBeHidden();

  await fab(page).click();
  const sheet = page.getByPlaceholder("名称 / 编号 · 空格分词");
  await expect(sheet).toBeVisible();
  // The results are still there behind it.
  await expect(cards).toBeVisible();

  // Escape closes it; so does the backdrop.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});
