/**
 * The deck list on a card page holds still while you use it.
 *
 * It used to be ordered by `updated_at`, so adding a copy sent that deck to
 * the top — the row you just clicked moved out from under the pointer and the
 * next deck you meant to click had shifted up one. Creation order doesn't move
 * while you work through a card.
 */
import { expect, test } from "@playwright/test";

const CARD = "/digimon/card/BT1-005";

async function deckOrder(page: import("@playwright/test").Page) {
  const groups = page.getByLabel("添加到卡组").getByRole("group");
  return groups.evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") ?? ""),
  );
}

test("adding a card doesn't reorder the deck list", async ({ page }) => {
  await page.goto(CARD);
  const expand = page.getByRole("button", { name: /展开/ });
  if (await expand.count()) await expand.click();

  const before = await deckOrder(page);
  expect(before.length).toBeGreaterThan(1);

  // The last deck is the one that would jump furthest.
  const target = before[before.length - 1];
  const row = page.getByRole("group", { name: target });
  await row.getByTitle("+1").click();
  await expect(row).toContainText("已有 1 张");

  await page.reload();
  if (await expand.count()) await expand.click();
  expect(await deckOrder(page)).toEqual(before);

  // Put the fixture back the way it was found.
  await page.getByRole("group", { name: target }).getByTitle("−1").click();
  await expect(page.getByRole("group", { name: target })).toContainText(
    "已有 0 张",
  );
});
