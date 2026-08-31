/**
 * The keyword table on 游戏知识 comes from the scraped official list, not from
 * the hand-written file — which is what makes a new set's keyword appear the
 * day it ships rather than whenever someone gets round to typing it in.
 *
 * The fixture stands in for that: Blocker is written up, Detach is not.
 */
import { expect, test } from "@playwright/test";

test("lists official keywords, written up or not", async ({ page }) => {
  await page.goto("/digimon/about");
  const list = page.locator("dl").filter({ hasText: "＜Blocker＞" });

  // Written up: names in all three, plus the explanation.
  const blocker = list.locator("div", { hasText: "＜Blocker＞" }).first();
  await expect(blocker).toContainText("阻挡者 · ブロッカー");
  await expect(blocker).toContainText("允许该数码兽进行阻挡");

  // Not written up: still a row, with the names derived from the cards.
  const detach = list.locator("div", { hasText: "＜Detach＞" }).first();
  await expect(detach).toContainText("分离 · 分離");

  // "Rule" is in the official dropdown and is not a keyword.
  await expect(page.getByText("＜Rule＞")).toHaveCount(0);
});
