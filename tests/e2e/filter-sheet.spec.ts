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

/**
 * Dragging the sheet back down closes it. The backdrop is a long reach when
 * the sheet is three quarters of the screen, and every other sheet on a phone
 * takes this gesture.
 *
 * CDP rather than page.touchscreen: the tap helper cannot move a finger, and
 * the handler is a native non-passive touchmove listener, so synthetic mouse
 * events would not reach it either.
 */
async function drag(page: import("@playwright/test").Page, from: { x: number; y: number }, by: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let step = 1; step <= 6; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x, y: from.y + (by * step) / 6 }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("a drag down closes it, a nudge does not", async ({ page }) => {
  await page.goto("/digimon");
  const sheet = page.locator(".filter-sheet");
  const field = page.getByPlaceholder("名称 / 编号 · 空格分词");

  await fab(page).click();
  await expect(field).toBeVisible();

  // A nudge: short, and the sheet stays. Slow, so it is not a flick either.
  const box = (await sheet.boundingBox())!;
  const grip = { x: box.x + box.width / 2, y: box.y + 8 };
  await drag(page, grip, 24);
  await expect(field).toBeVisible();

  await drag(page, grip, 260);
  await expect(field).toBeHidden();
});
