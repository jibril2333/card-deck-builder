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
