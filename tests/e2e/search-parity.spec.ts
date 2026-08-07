/**
 * The card browser and the collection are the same search over different
 * scopes, so their search box should be the same control. It had drifted:
 * the collection kept the old placeholder, had no "also search effects"
 * checkbox, matched effect text with no way to turn that off, and never
 * showed the keyword as a removable chip.
 *
 * This compares the two rather than restating either, so whichever one is
 * changed next, the other has to keep up.
 */
import { expect, test } from "@playwright/test";

const PAGES = [
  { name: "卡牌检索", url: "/digimon" },
  { name: "已收集", url: "/digimon/collection" },
];

for (const { name, url } of PAGES) {
  test(`${name}: search box has the same affordances`, async ({ page }) => {
    await page.goto(url);
    const box = page.locator('input[name="q"]');
    await box.waitFor();

    await expect(box).toHaveAttribute("placeholder", "名称 / 编号 · 空格分词");
    await expect(page.getByText("同时搜索效果和特征")).toBeVisible();

    // Clear button appears only once there's something to clear.
    await expect(page.getByRole("button", { name: "清空" })).toHaveCount(0);
    await box.fill("Agumon");
    await expect(page.getByRole("button", { name: "清空" })).toBeVisible();
  });

  test(`${name}: terms become one chip each`, async ({ page }) => {
    await page.goto(`${url}?q=${encodeURIComponent("Imperialdramon Dragon")}`);
    const chips = page.locator('button:has-text("关键词:")');
    await expect(chips).toHaveCount(2);

    // Dropping one term keeps the other, rather than clearing the search.
    await page.locator('button:has-text("关键词: Imperialdramon")').click();
    await page.waitForTimeout(1500);
    expect(new URL(page.url()).searchParams.get("q")).toBe("Dragon");
  });
}
