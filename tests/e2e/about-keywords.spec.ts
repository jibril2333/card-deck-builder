/**
 * The keyword table on 游戏知识 comes from the scraped official list, not from
 * the hand-written file — which is what makes a new set's keyword appear the
 * day it ships rather than whenever someone gets round to typing it in.
 *
 * The fixture stands in for that: Blocker is written up, "Sample Keyword" is
 * not.
 */
import { expect, test } from "@playwright/test";

test("lists official keywords, written up or not", async ({ page }) => {
  await page.goto("/digimon/about");
  const list = page.locator("dl").filter({ hasText: "＜Blocker＞" });

  // Written up: all three spellings, in the card's own keyword chip, plus the
  // explanation.
  const blocker = list.locator("div", { hasText: "＜Blocker＞" }).first();
  await expect(blocker).toContainText("《阻挡者》");
  await expect(blocker).toContainText("≪ブロッカー≫");
  await expect(blocker).toContainText("允许该数码兽进行阻挡");

  // The chip is the card's, not a theme colour.
  await expect(blocker.locator("span").first()).toHaveClass(/#e8830c/);

  // A keyword nobody has written up: still a row, still all three spellings,
  // just no paragraph under it.
  const fresh = list.locator("div", { hasText: "＜Sample Keyword＞" }).first();
  await expect(fresh).toContainText("《样例》");
  await expect(fresh).toContainText("≪サンプル≫");
  expect((await fresh.innerText()).replace(/\s/g, "")).toBe(
    "＜SampleKeyword＞《样例》≪サンプル≫",
  );

  // "Rule" is in the official dropdown and is not a keyword.
  await expect(page.getByText("＜Rule＞")).toHaveCount(0);
});
