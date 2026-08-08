/**
 * The adjustment memo's result list.
 *
 * The panel sits below the whole card grid, so a list that always opened
 * downward with a fixed cap ran off the bottom of the window — the matches
 * were there, just below the fold.
 */
import { expect, test } from "@playwright/test";

test("the result list stays on screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("ADJ " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  const box = page.getByPlaceholder(/搜卡片/);
  await box.scrollIntoViewIfNeeded();
  // Park the input ~140px from the bottom — where it lands on a real deck —
  // and search something with several matches. A one-row list fits below even
  // when broken, so it proves nothing.
  await box.evaluate((el) => {
    const r = el.getBoundingClientRect();
    window.scrollBy(0, r.bottom - (window.innerHeight - 140));
  });
  await page.waitForTimeout(300);

  await box.fill("mon");
  const list = page.locator("div.absolute.z-20").first();
  await list.waitFor();
  await page.waitForTimeout(600);

  const r = await list.boundingBox();
  const h = page.viewportSize()!.height;
  console.log(`[dropdown] 输入框底 ${Math.round((await box.boundingBox())!.y)} · 列表 ${Math.round(r!.y)}→${Math.round(r!.y + r!.height)} · 视口高 ${h}`);

  // Fully within the window, both edges. This is the bug.
  expect(r!.y).toBeGreaterThanOrEqual(-1);
  expect(r!.y + r!.height).toBeLessThanOrEqual(h + 1);
  // And nothing is cut off inside it — a list that fits on screen but clips
  // its own content would pass the check above and still hide the match.
  const clipped = await list.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 1,
  );
  expect(clipped).toBe(false);
  // Several matches, so the list is tall enough for the bug to show.
  expect(await list.locator("button").count()).toBeGreaterThan(2);
});

test("it opens downward when there is room", async ({ page }) => {
  // Flipping is for the cramped case only; a list that jumps sides while you
  // type is worse than a short one.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill("ADJ2 " + Date.now());
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  const box = page.getByPlaceholder(/搜卡片/);
  await box.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await box.fill("mon");
  const list = page.locator("div.absolute.z-20").first();
  await list.waitFor();
  await page.waitForTimeout(500);

  const b = (await box.boundingBox())!;
  const r = (await list.boundingBox())!;
  expect(r.y).toBeGreaterThan(b.y);
});
