/**
 * The deck's info bar: everything wrong with the deck, above 卡组分布.
 *
 * The part worth a browser is the import's leftovers. They used to be written
 * into the deck's NOTES — the owner's own field — as a wall of card codes that
 * only a manual edit removed. Now they ride in `decks.import_report`, show up
 * here, and go away when dismissed; the notes stay empty throughout, which is
 * the actual complaint being fixed.
 */
import { expect, test } from "@playwright/test";

const bar = (p: import("@playwright/test").Page) =>
  p.getByRole("status", { name: "卡组信息" });

test("an import says what it couldn't place, and forgets it when told", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/digimon/decks");
  // Two real cards and one code no card database will ever have.
  await page.evaluate(() =>
    navigator.clipboard.writeText("4 BT1-001\n2 BT1-084\n3 ZZ9-999\n"),
  );
  await page.getByRole("button", { name: /导入/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  await expect(bar(page)).toContainText("未收录");
  await expect(bar(page)).toContainText("ZZ9-999");
  await expect(bar(page)).toContainText("×3");
  // The whole point: the owner's notes field is untouched.
  await expect(page.getByLabel("备注")).toHaveText("");

  // A 9-card deck is also short of 50 — same bar, same glance.
  await expect(bar(page)).toContainText("主卡组");

  await bar(page).getByRole("button", { name: "知道了" }).click();
  await expect(bar(page)).not.toContainText("ZZ9-999");
  await page.reload();
  await expect(bar(page)).not.toContainText("ZZ9-999");
  // Dismissing the import notice doesn't dismiss the deck's real problems.
  await expect(bar(page)).toContainText("主卡组");
});

test("a deck with nothing wrong has no bar at all", async ({ page }) => {
  await page.goto("/digimon/decks");
  await page.getByPlaceholder("卡组名").fill(`E2E 空卡组 ${Date.now()}`);
  await page.getByRole("button", { name: /创建/ }).click();
  await page.waitForURL(/\/digimon\/decks\/[a-z0-9-]+/i);

  // Empty and brand new: not "wrong", just unstarted.
  await expect(bar(page)).toHaveCount(0);
});
