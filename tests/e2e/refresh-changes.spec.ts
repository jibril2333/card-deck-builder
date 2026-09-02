/**
 * The admin page's changelog.
 *
 * A refresh used to report "4370 → 4397 cards" and nothing else. What matters
 * most in the detail is a banlist move — it's the only change here that can
 * invalidate a deck you already built — so this checks it is both counted
 * separately and sorted to the front, not just present somewhere in the list.
 */
import { expect, test } from "@playwright/test";

const panel = (p: import("@playwright/test").Page) =>
  p.getByRole("region", { name: "更新变更" });

test("shows what a refresh changed, banlist moves first", async ({ page }) => {
  await page.goto("/digimon/settings");
  const box = panel(page);
  await expect(box).toBeVisible();

  const run = box.getByRole("button").first();
  await expect(run).toContainText("共 3 处");
  // Called out on the collapsed row, not buried in the detail.
  await expect(run).toContainText("禁限变动 1");

  await run.click();
  await expect(box.getByText("limited_1")).toBeVisible();
  await expect(box.getByText("banned")).toBeVisible();

  // The banlist row sorts ahead of the card/field rows.
  const kinds = await box.locator("div.divide-y > div span.font-mono").allTextContents();
  expect(kinds[0]).toBe("BT1-086");
});

test("每一行说清楚是哪张卡、改了哪个字段", async ({ page }) => {
  await page.goto("/digimon/settings");
  const box = panel(page);
  await box.getByRole("button").first().click();

  // Grouped by kind, with a count per group.
  await expect(box.getByText(/^禁限变更 · \d+$/)).toBeVisible();
  await expect(box.getByText(/^字段改动 · \d+$/)).toBeVisible();

  // Rows carry the card's NAME, not just its code…
  const text = (await box.innerText()).replace(/\s+/g, " ");
  expect(text).toContain("BT1-084 Omnimon");
  expect(text).toContain("BT1-086 Matt Ishida");
  // …and the field is labelled in Chinese, not by its column name.
  expect(text).toContain("主要效果");
  expect(text).not.toContain("main_effect");
});
